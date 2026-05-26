import shaderSource from './lbm3d.wgsl?raw';

export class LBM3DSolver {
  public Nx: number;
  public Ny: number;
  public Nz: number;
  public totalCells: number;

  public macroData: Float32Array;
  public obstacleData: Uint32Array;

  public lastLiftForce = 0;
  public lastDragForce = 0;
  public lastLiftCoeff = 0;
  public lastDragCoeff = 0;
  public isStable = true;
  public groundRow = -1;

  private device: GPUDevice;
  private collidePipeline!: GPUComputePipeline;
  private streamPipeline!: GPUComputePipeline;
  private swapPipeline!: GPUComputePipeline;
  private vorticityPipeline!: GPUComputePipeline;
  private bindGroup!: GPUBindGroup;
  private paramsBuffer!: GPUBuffer;
  private fBufferA!: GPUBuffer;
  private fBufferB!: GPUBuffer;
  private obstacleBuffer!: GPUBuffer;
  private macroBuffer!: GPUBuffer;
  private readbackBuffer!: GPUBuffer;
  private workgroupCount: number;
  private readbackPending = false;

  constructor(device: GPUDevice, Nx: number, Ny: number, Nz: number) {
    this.device = device;
    this.Nx = Nx;
    this.Ny = Ny;
    this.Nz = Nz;
    this.totalCells = Nx * Ny * Nz;
    this.macroData = new Float32Array(this.totalCells * 7);
    this.obstacleData = new Uint32Array(this.totalCells);
    this.workgroupCount = Math.ceil(this.totalCells / 256);
  }

  async init() {
    const device = this.device;
    const tc = this.totalCells;

    const shaderModule = device.createShaderModule({ code: shaderSource });

    const fSize = tc * 19 * 4;
    const storageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.fBufferA = device.createBuffer({ size: fSize, usage: storageFlags });
    this.fBufferB = device.createBuffer({ size: fSize, usage: storageFlags });
    this.obstacleBuffer = device.createBuffer({ size: tc * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.macroBuffer = device.createBuffer({ size: tc * 7 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.paramsBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.readbackBuffer = device.createBuffer({ size: tc * 7 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    // All shaders share the same layout: fA and fB are both read_write
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    this.collidePipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shaderModule, entryPoint: 'collide' } });
    this.streamPipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shaderModule, entryPoint: 'stream' } });
    this.swapPipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shaderModule, entryPoint: 'swap' } });
    this.vorticityPipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module: shaderModule, entryPoint: 'vorticity' } });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.fBufferA } },
        { binding: 2, resource: { buffer: this.fBufferB } },
        { binding: 3, resource: { buffer: this.obstacleBuffer } },
        { binding: 4, resource: { buffer: this.macroBuffer } },
      ],
    });
  }

  private updateParams(u0: number, viscosity: number) {
    const omega = Math.min(1.0 / (3.0 * viscosity + 0.5), 1.95);
    const data = new ArrayBuffer(32);
    const u32v = new Uint32Array(data);
    const f32v = new Float32Array(data);
    const i32v = new Int32Array(data);
    u32v[0] = this.Nx; u32v[1] = this.Ny; u32v[2] = this.Nz;
    f32v[3] = u0; f32v[4] = omega; i32v[5] = this.groundRow;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }

  reset(u0: number) {
    this.isStable = true;
    const tc = this.totalCells;
    const fData = new Float32Array(tc * 19);
    const Ws = [1/3, 1/18,1/18,1/18,1/18,1/18,1/18, 1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36];
    const Ds = [0,1,-1,0,0,0,0, 1,-1,1,-1,1,-1,1,-1,0,0,0,0];

    for (let ci = 0; ci < tc; ci++) {
      const isObs = this.obstacleData[ci] === 1;
      const vx = isObs ? 0 : u0;
      const u2 = vx * vx;
      const base = ci * 19;
      for (let i = 0; i < 19; i++) {
        const udot = Ds[i] * vx;
        fData[base + i] = Ws[i] * (1 + 3 * udot + 4.5 * udot * udot - 1.5 * u2);
      }
    }

    this.device.queue.writeBuffer(this.fBufferA, 0, fData);
    this.device.queue.writeBuffer(this.fBufferB, 0, fData);
  }

  uploadObstacle() {
    this.device.queue.writeBuffer(this.obstacleBuffer, 0, this.obstacleData);
  }

  step(u0: number, viscosity: number) {
    if (!this.isStable) return;
    this.updateParams(u0, viscosity);

    const bg = this.bindGroup;
    const wg = this.workgroupCount;
    const encoder = this.device.createCommandEncoder();

    // 1. Collide: read fA, compute macroscopic, write post-collision back to fA
    const c = encoder.beginComputePass();
    c.setPipeline(this.collidePipeline);
    c.setBindGroup(0, bg);
    c.dispatchWorkgroups(wg);
    c.end();

    // 2. Stream: read post-collision fA, write propagated to fB
    const s = encoder.beginComputePass();
    s.setPipeline(this.streamPipeline);
    s.setBindGroup(0, bg);
    s.dispatchWorkgroups(wg);
    s.end();

    // 3. Swap: copy fB → fA for next timestep
    const sw = encoder.beginComputePass();
    sw.setPipeline(this.swapPipeline);
    sw.setBindGroup(0, bg);
    sw.dispatchWorkgroups(wg);
    sw.end();

    // 4. Vorticity: compute from macroscopic data
    const v = encoder.beginComputePass();
    v.setPipeline(this.vorticityPipeline);
    v.setBindGroup(0, bg);
    v.dispatchWorkgroups(wg);
    v.end();

    this.device.queue.submit([encoder.finish()]);
  }

  async readbackMacro(): Promise<Float32Array> {
    if (this.readbackPending) return this.macroData;
    this.readbackPending = true;

    const size = this.totalCells * 7 * 4;
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.macroBuffer, 0, this.readbackBuffer, 0, size);
    this.device.queue.submit([encoder.finish()]);

    try {
      await this.readbackBuffer.mapAsync(GPUMapMode.READ);
      const mapped = this.readbackBuffer.getMappedRange();
      this.macroData = new Float32Array(mapped.slice(0));
      this.readbackBuffer.unmap();
    } catch {
      // Buffer busy, skip this frame
    }
    this.readbackPending = false;
    return this.macroData;
  }

  queryVelocity3D(px: number, py: number, pz: number): { ux: number; uy: number; uz: number } {
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const z0 = Math.floor(pz);
    if (x0 < 0 || x0 >= this.Nx || y0 < 0 || y0 >= this.Ny || z0 < 0 || z0 >= this.Nz) {
      return { ux: 0, uy: 0, uz: 0 };
    }
    const idx = ((z0 * this.Ny + y0) * this.Nx + x0) * 7;
    return {
      ux: this.macroData[idx + 1] || 0,
      uy: this.macroData[idx + 2] || 0,
      uz: this.macroData[idx + 3] || 0,
    };
  }

  queryVelocity(px: number, py: number): { ux: number; uy: number } {
    const v = this.queryVelocity3D(px, py, Math.floor(this.Nz / 2));
    return { ux: v.ux, uy: v.uy };
  }

  get obstacle(): Uint32Array { return this.obstacleData; }

  destroy() {
    this.fBufferA.destroy();
    this.fBufferB.destroy();
    this.obstacleBuffer.destroy();
    this.macroBuffer.destroy();
    this.paramsBuffer.destroy();
    this.readbackBuffer.destroy();
  }
}
