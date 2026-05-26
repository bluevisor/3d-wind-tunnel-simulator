import shaderSource from './lbm3d.wgsl?raw';

export class LBM3DSolver {
  public Nx: number;
  public Ny: number;
  public Nz: number;
  public totalCells: number;

  // CPU-side readback buffers
  public macroData: Float32Array;
  public obstacleData: Uint32Array;

  // Aero coefficients
  public lastLiftForce = 0;
  public lastDragForce = 0;
  public lastSideForce = 0;
  public lastLiftCoeff = 0;
  public lastDragCoeff = 0;
  public isStable = true;
  public groundRow = -1;

  private device: GPUDevice;
  private collidePipeline!: GPUComputePipeline;
  private streamPipeline!: GPUComputePipeline;
  private vorticityPipeline!: GPUComputePipeline;
  private bindGroupA!: GPUBindGroup;
  private bindGroupB!: GPUBindGroup;
  private paramsBuffer!: GPUBuffer;
  private fBufferA!: GPUBuffer;
  private fBufferB!: GPUBuffer;
  private obstacleBuffer!: GPUBuffer;
  private macroBuffer!: GPUBuffer;
  private readbackBuffer!: GPUBuffer;
  private sliceReadbackBuffer!: GPUBuffer;
  private pingPong = 0;
  private workgroupCount: number;

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
    this.fBufferA = device.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.fBufferB = device.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });

    const obsSize = tc * 4;
    this.obstacleBuffer = device.createBuffer({ size: obsSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const macroSize = tc * 7 * 4;
    this.macroBuffer = device.createBuffer({ size: macroSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });

    this.paramsBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.readbackBuffer = device.createBuffer({ size: macroSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const sliceSize = Math.max(this.Nx, this.Ny, this.Nz) * Math.max(this.Nx, this.Ny, this.Nz) * 7 * 4;
    this.sliceReadbackBuffer = device.createBuffer({ size: sliceSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    this.collidePipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'collide' },
    });

    this.streamPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'stream' },
    });

    this.vorticityPipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'vorticity' },
    });

    this.bindGroupA = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.fBufferA } },
        { binding: 2, resource: { buffer: this.fBufferB } },
        { binding: 3, resource: { buffer: this.obstacleBuffer } },
        { binding: 4, resource: { buffer: this.macroBuffer } },
      ],
    });

    this.bindGroupB = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.fBufferB } },
        { binding: 2, resource: { buffer: this.fBufferA } },
        { binding: 3, resource: { buffer: this.obstacleBuffer } },
        { binding: 4, resource: { buffer: this.macroBuffer } },
      ],
    });
  }

  private updateParams(u0: number, viscosity: number) {
    const omega = Math.min(1.0 / (3.0 * viscosity + 0.5), 1.95);
    const data = new ArrayBuffer(32);
    const u32View = new Uint32Array(data);
    const f32View = new Float32Array(data);
    const i32View = new Int32Array(data);
    u32View[0] = this.Nx;
    u32View[1] = this.Ny;
    u32View[2] = this.Nz;
    f32View[3] = u0;
    f32View[4] = omega;
    i32View[5] = this.groundRow;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }

  reset(u0: number) {
    this.isStable = true;
    const tc = this.totalCells;
    const fData = new Float32Array(tc * 19);

    for (let z = 0; z < this.Nz; z++) {
      for (let y = 0; y < this.Ny; y++) {
        for (let x = 0; x < this.Nx; x++) {
          const cellIdx = (z * this.Ny + y) * this.Nx + x;
          const isObs = this.obstacleData[cellIdx] === 1;
          const vx = isObs ? 0 : u0;
          const rho = 1.0;
          const u2 = vx * vx;

          for (let i = 0; i < 19; i++) {
            const W = [1/3, 1/18,1/18,1/18,1/18,1/18,1/18, 1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36];
            const DX = [0,1,-1,0,0,0,0, 1,-1,1,-1,1,-1,1,-1,0,0,0,0];
            const udot = DX[i] * vx;
            fData[cellIdx * 19 + i] = W[i] * rho * (1 + 3 * udot + 4.5 * udot * udot - 1.5 * u2);
          }
        }
      }
    }

    this.device.queue.writeBuffer(this.fBufferA, 0, fData);
    this.device.queue.writeBuffer(this.fBufferB, 0, fData);
    this.pingPong = 0;
  }

  uploadObstacle() {
    this.device.queue.writeBuffer(this.obstacleBuffer, 0, this.obstacleData);
  }

  step(u0: number, viscosity: number) {
    if (!this.isStable) return;
    this.updateParams(u0, viscosity);

    const bindGroup = this.pingPong === 0 ? this.bindGroupA : this.bindGroupB;
    const encoder = this.device.createCommandEncoder();

    const collidePass = encoder.beginComputePass();
    collidePass.setPipeline(this.collidePipeline);
    collidePass.setBindGroup(0, bindGroup);
    collidePass.dispatchWorkgroups(this.workgroupCount);
    collidePass.end();

    const streamPass = encoder.beginComputePass();
    streamPass.setPipeline(this.streamPipeline);
    streamPass.setBindGroup(0, bindGroup);
    streamPass.dispatchWorkgroups(this.workgroupCount);
    streamPass.end();

    const vortPass = encoder.beginComputePass();
    vortPass.setPipeline(this.vorticityPipeline);
    vortPass.setBindGroup(0, bindGroup);
    vortPass.dispatchWorkgroups(this.workgroupCount);
    vortPass.end();

    this.device.queue.submit([encoder.finish()]);
    this.pingPong = 1 - this.pingPong;
  }

  async readbackMacro(): Promise<Float32Array> {
    const size = this.totalCells * 7 * 4;
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.macroBuffer, 0, this.readbackBuffer, 0, size);
    this.device.queue.submit([encoder.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(this.readbackBuffer.getMappedRange().slice(0));
    this.readbackBuffer.unmap();
    this.macroData = data;
    return data;
  }

  async readbackSlice(axis: 'z' | 'y', sliceIdx: number): Promise<{ data: Float32Array; w: number; h: number }> {
    const macro = await this.readbackMacro();
    let w: number, h: number;
    let slice: Float32Array;

    if (axis === 'z') {
      w = this.Nx; h = this.Ny;
      slice = new Float32Array(w * h * 7);
      const z = Math.min(Math.max(sliceIdx, 0), this.Nz - 1);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((z * this.Ny + y) * this.Nx + x) * 7;
          const dstIdx = (y * w + x) * 7;
          for (let f = 0; f < 7; f++) slice[dstIdx + f] = macro[srcIdx + f];
        }
      }
    } else {
      w = this.Nx; h = this.Nz;
      slice = new Float32Array(w * h * 7);
      const y = Math.min(Math.max(sliceIdx, 0), this.Ny - 1);
      for (let z = 0; z < h; z++) {
        for (let x = 0; x < w; x++) {
          const srcIdx = ((z * this.Ny + y) * this.Nx + x) * 7;
          const dstIdx = (z * w + x) * 7;
          for (let f = 0; f < 7; f++) slice[dstIdx + f] = macro[srcIdx + f];
        }
      }
    }

    return { data: slice, w, h };
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

  // 2D solver compatibility shim
  queryVelocity(px: number, py: number): { ux: number; uy: number } {
    const midZ = Math.floor(this.Nz / 2);
    const v = this.queryVelocity3D(px, py, midZ);
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
    this.sliceReadbackBuffer.destroy();
  }
}
