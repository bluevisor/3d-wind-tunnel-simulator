import { useRef, useState, useEffect } from 'react';
import { Pause, Play, RotateCcw, Settings, Wind } from 'lucide-react';
import { LBMSolver } from './lbmSolver';
import { NacaParams, ObstacleType, Point2D, SimulationParams, VisualOptions } from './types';
import WindTunnelCanvas from './components/WindTunnelCanvas';
import ShapeCreator from './components/ShapeCreator';
import AnalyticsPanel from './components/AnalyticsPanel';
import EducationalPanel from './components/EducationalPanel';
import { formatKmh, inletVelocityToKmh } from './physicalScale';
import { LBM3DSolver } from './gpu/LBM3DSolver';
import { initWebGPU } from './gpu/webgpuUtils';

export default function App() {
  const Nx = 1200;
  const Ny = 600;
  const Nz = 80;

  const solverRef = useRef<LBMSolver | null>(null);
  if (!solverRef.current) solverRef.current = new LBMSolver(Nx, Ny);
  const solver = solverRef.current;

  const solver3DRef = useRef<LBM3DSolver | null>(null);
  const [gpuReady, setGpuReady] = useState(false);
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gpu = await initWebGPU();
      if (cancelled || !gpu) return;
      const s3d = new LBM3DSolver(gpu.device, 200, 100, Nz);
      await s3d.init();
      s3d.reset(0.08);
      solver3DRef.current = s3d;
      setGpuReady(true);
      setUse3D(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [isSimulating, setIsSimulating] = useState(true);
  const [activeTab, setActiveTab] = useState<'controls' | 'telemetry' | 'theory'>('controls');
  const [customPoints, setCustomPoints] = useState<Point2D[] | null>(null);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [fps, setFps] = useState(0);

  const [params, setParams] = useState<SimulationParams>({
    obstacleType: 'car',
    inletVelocity: 0.08,
    viscosity: 0.015,
    angleIndex: 0,
    stepsPerFrame: 1,
    obstacleScale: 1.0,
    nacaParams: { m: 0.02, p: 0.40, t: 0.12 },
  });

  const [visuals, setVisuals] = useState<VisualOptions>({
    showSmoke: true,
    showStreamlines: false,
    showVectors: false,
    showSlice: false,
    showSurfaceColor: true,
    showGround: true,
    sliceZ: 0,
    coloring: 'velocity',
    particleCount: 50000,
    particleSize: 1.0,
  });

  useEffect(() => {
    tweakVisual('showGround', ['car', 'train'].includes(params.obstacleType));
  }, [params.obstacleType]);

  const resetFlow = () => solver.reset(params.inletVelocity);

  const tweakParam = <K extends keyof SimulationParams>(key: K, val: SimulationParams[K]) =>
    setParams(p => ({ ...p, [key]: val }));
  const tweakNaca = <K extends keyof NacaParams>(key: K, val: NacaParams[K]) =>
    setParams(p => ({ ...p, nacaParams: { ...p.nacaParams, [key]: val } }));
  const tweakVisual = <K extends keyof VisualOptions>(key: K, val: VisualOptions[K]) =>
    setVisuals(v => ({ ...v, [key]: val }));

  const handleCustomPoints = (points: Point2D[]) => {
    setCustomPoints(points);
    tweakParam('obstacleType', points.length > 0 ? 'custom' : 'circle');
  };

  const handleUploadedImage = (img: HTMLImageElement | null) => {
    setUploadedImage(img);
    tweakParam('obstacleType', img ? 'uploaded' : 'circle');
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (!solver.isStable) { console.warn('[App] Repairing unstable grid.'); resetFlow(); }
    }, 1000);
    return () => clearInterval(id);
  }, [params.inletVelocity]);

  const Re = params.inletVelocity * 26 * (Nx / 120) / Math.max(params.viscosity, 0.001);
  const Ma = params.inletVelocity / (1 / Math.sqrt(3));
  const qDyn = 0.5 * params.inletVelocity * params.inletVelocity;
  const speedKmh = inletVelocityToKmh(params.inletVelocity);

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 font-sans select-none antialiased relative overflow-hidden">
      <WindTunnelCanvas
        solver={solver}
        solver3D={use3D ? solver3DRef.current : null}
        params={params}
        visuals={visuals}
        isSimulating={isSimulating}
        customPoints={customPoints}
        onFpsUpdate={setFps}
      />

      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Wind size={16} className="text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200">3D WIND TUNNEL</span>
          <span className="text-[9px] font-mono text-slate-500 hidden sm:inline">
            {use3D ? `D3Q19 200×100×${Nz}` : `D2Q9 ${Nx}×${Ny}`}
          </span>
          {use3D && <span className="text-[8px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">3D GPU</span>}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {gpuReady && (
            <button onClick={() => setUse3D(!use3D)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold backdrop-blur-md border transition ${use3D ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-950/70 text-slate-400 border-slate-800/50'}`}>
              {use3D ? '3D' : '2D'}
            </button>
          )}
          <button onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-md border transition ${isSimulating ? 'bg-slate-950/70 text-amber-400 border-amber-500/25 hover:bg-slate-900/80' : 'bg-emerald-500/90 text-slate-950 border-emerald-400 hover:bg-emerald-400'}`}>
            {isSimulating ? <><Pause size={11} fill="currentColor" /> Pause</> : <><Play size={11} fill="currentColor" /> Resume</>}
          </button>
          <button onClick={resetFlow}
            className="px-3 py-1.5 bg-slate-950/70 backdrop-blur-md border border-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition">
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      {/* Aero HUD */}
      <div className="absolute top-16 left-4 z-20 bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl px-3.5 py-2.5 pointer-events-none font-mono text-[11px] space-y-1 min-w-[160px]">
        <div className="text-[9px] text-slate-600 font-bold tracking-wider mb-1">AERODYNAMICS</div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">C_L</span><span className="text-emerald-400 font-semibold">{solver.lastLiftCoeff.toFixed(4)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">C_D</span><span className="text-amber-400 font-semibold">{solver.lastDragCoeff.toFixed(4)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">L/D</span><span className="text-slate-300">{solver.lastDragCoeff !== 0 ? (solver.lastLiftCoeff / solver.lastDragCoeff).toFixed(2) : '0.00'}</span></div>
        <div className="border-t border-slate-800/50 pt-1 mt-1 text-[9px] text-slate-600 font-bold tracking-wider mb-1">FLOW CONDITIONS</div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Re</span><span className="text-sky-400 font-semibold">{Re >= 1000 ? `${(Re / 1000).toFixed(1)}k` : Re.toFixed(0)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Ma</span><span className="text-slate-300">{Ma.toFixed(3)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">q</span><span className="text-slate-300">{qDyn.toFixed(4)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">U<sub>&infin;</sub></span><span className="text-slate-300">{formatKmh(speedKmh)} km/h</span></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">&nu;</span><span className="text-slate-300">{params.viscosity.toFixed(4)}</span></div>
        <div className="border-t border-slate-800/50 pt-1 mt-1 flex justify-between gap-4"><span className="text-slate-500">FPS</span><span className={`font-semibold ${fps >= 30 ? 'text-emerald-400' : fps >= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{fps}</span></div>
      </div>

      {/* Control panel */}
      <div className={`absolute top-4 right-4 bottom-4 z-20 transition-all duration-300 ${activeTab ? 'w-80' : 'w-10'}`}>
        {activeTab ? (
          <div className="h-full bg-slate-950/80 backdrop-blur-md border border-slate-800/50 rounded-2xl flex flex-col overflow-hidden">
            <div className="flex border-b border-slate-800/50 shrink-0">
              {(['controls', 'telemetry', 'theory'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-[10px] font-semibold transition ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
                  {tab === 'controls' ? 'Controls' : tab === 'telemetry' ? 'Telemetry' : 'Theory'}
                </button>
              ))}
              <button onClick={() => setActiveTab(null as any)} className="px-2.5 text-slate-600 hover:text-slate-300 text-xs">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {activeTab === 'controls' && (
                <>
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Visualization</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {[['Particles', 'showSmoke'], ['Flow Slice', 'showSlice'], ['Ground', 'showGround']].map(([label, key]) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                          <input type="checkbox" checked={(visuals as any)[key]} onChange={e => tweakVisual(key as any, e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 bg-slate-900" />
                          {label}
                        </label>
                      ))}
                    </div>
                    {visuals.showSmoke && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">Size</span>
                          <input type="range" min="0.05" max="3.0" step="0.05" value={visuals.particleSize} onChange={e => tweakVisual('particleSize', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-7 text-right">{visuals.particleSize.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">Density</span>
                          <input type="range" min="1000" max="100000" step="1000" value={visuals.particleCount} onChange={e => tweakVisual('particleCount', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{visuals.particleCount >= 1000 ? `${(visuals.particleCount / 1000).toFixed(0)}k` : visuals.particleCount}</span>
                        </div>
                      </div>
                    )}
                    {visuals.showSlice && (
                      <select value={visuals.coloring} onChange={e => tweakVisual('coloring', e.target.value as any)} className="w-full bg-slate-900/80 border border-slate-800/50 text-slate-300 text-[11px] py-1.5 px-2 rounded-lg cursor-pointer">
                        <option value="velocity">Velocity Magnitude</option>
                        <option value="pressure">Pressure Field</option>
                        <option value="vorticity">Vorticity</option>
                      </select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Aerodynamic Profile</span>
                    <select value={params.obstacleType} onChange={e => tweakParam('obstacleType', e.target.value as ObstacleType)} className="w-full bg-slate-900/80 border border-slate-800/50 text-slate-200 text-[11px] font-semibold py-2 px-2.5 rounded-lg cursor-pointer">
                      <option value="car">Tesla Model 3</option>
                      <option value="train">Shinkansen N700</option>
                      <option value="naca0012">NACA 0012</option>
                      <option value="naca2412">NACA 2412</option>
                      <option value="naca4412">NACA 4412</option>
                      <option value="circle">Cylinder</option>
                      <option value="flat_plate">Flat Plate</option>
                      <option value="custom">Custom Shape</option>
                      <option value="uploaded">Upload Image</option>
                    </select>
                  </div>

                  {(params.obstacleType === 'custom' || params.obstacleType === 'uploaded') && (
                    <ShapeCreator Nx={Nx} Ny={Ny} onCustomShapeCreated={handleCustomPoints} onImageUploaded={handleUploadedImage} />
                  )}

                  {params.obstacleType.startsWith('naca') && (
                    <div className="space-y-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">NACA Parameters</span>
                      {([['Camber', 'm', 0, 0.09, 0.01, (v: number) => `${(v * 100).toFixed(0)}%`],
                        ['Position', 'p', 0.1, 0.8, 0.1, (v: number) => `${(v * 10).toFixed(0)}/10`],
                        ['Thickness', 't', 0.06, 0.25, 0.01, (v: number) => `${(v * 100).toFixed(0)}%`]] as const).map(([label, key, min, max, step, fmt]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">{label}</span>
                          <input type="range" min={min} max={max} step={step} value={params.nacaParams[key]} onChange={e => tweakNaca(key, parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{fmt(params.nacaParams[key])}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Fluid Parameters</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">AoA</span>
                      <input type="range" min="-30" max="30" step="1" value={params.angleIndex} onChange={e => tweakParam('angleIndex', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.angleIndex}&deg;</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Velocity</span>
                      <input type="range" min="0" max="0.15" step="0.005" value={params.inletVelocity} onChange={e => tweakParam('inletVelocity', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">{formatKmh(inletVelocityToKmh(params.inletVelocity))} km/h</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Viscosity</span>
                      <input type="range" min="0" max="100" step="1"
                        value={Math.round(Math.log(params.viscosity / 0.002) / Math.log(0.5 / 0.002) * 100)}
                        onChange={e => { const t = parseFloat(e.target.value) / 100; tweakParam('viscosity', parseFloat((0.002 * Math.pow(0.5 / 0.002, t)).toFixed(4))); }}
                        className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">
                        {params.viscosity <= 0.005 ? 'air' : params.viscosity >= 0.35 ? 'honey' : params.viscosity >= 0.1 ? 'oil' : params.viscosity >= 0.03 ? 'water' : (params.viscosity * 1000).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Steps/F</span>
                      <input type="range" min="1" max="16" step="1" value={params.stepsPerFrame} onChange={e => tweakParam('stepsPerFrame', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.stepsPerFrame}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Scale</span>
                      <input type="range" min="0.5" max="2.0" step="0.1" value={params.obstacleScale} onChange={e => tweakParam('obstacleScale', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.obstacleScale.toFixed(1)}x</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Fluid Preset</span>
                    <div className="flex flex-wrap gap-1.5">
                      {([['Air', 0.002], ['Water', 0.035], ['Oil', 0.15], ['Honey', 0.45]] as const).map(([name, v]) => (
                        <button key={name} onClick={() => tweakParam('viscosity', v)}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition ${Math.abs(params.viscosity - v) < 0.005 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900/50 text-slate-500 border-slate-800/50 hover:text-slate-300'}`}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {activeTab === 'telemetry' && <AnalyticsPanel solver={solver} params={params} isSimulating={isSimulating} />}
              {activeTab === 'theory' && <EducationalPanel />}
            </div>
          </div>
        ) : (
          <button onClick={() => setActiveTab('controls')}
            className="bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl p-2.5 text-slate-400 hover:text-emerald-400 transition">
            <Settings size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
