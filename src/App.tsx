/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Settings,
  Wind,
} from 'lucide-react';
import { LBMSolver } from './lbmSolver';
import { NacaParams, ObstacleType, Point2D, SimulationParams, VisualOptions } from './types';
import WindTunnelCanvas from './components/WindTunnelCanvas';
import ShapeCreator from './components/ShapeCreator';
import AnalyticsPanel from './components/AnalyticsPanel';
import EducationalPanel from './components/EducationalPanel';

export default function App() {
  const Nx = 1200;
  const Ny = 600;

  // Initialize the Lattice Boltzmann engine inside a persistent Ref to prevent React re-instantiation
  const solverRef = useRef<LBMSolver | null>(null);
  if (!solverRef.current) {
    solverRef.current = new LBMSolver(Nx, Ny);
  }
  const solver = solverRef.current;

  // 1. Simulation States
  const [isSimulating, setIsSimulating] = useState(true);
  const [activeTab, setActiveTab] = useState<'controls' | 'telemetry' | 'theory'>('controls');

  const [customPoints, setCustomPoints] = useState<Point2D[] | null>(null);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [fps, setFps] = useState(0);

  // Default Simulation Parameters
  const [params, setParams] = useState<SimulationParams>({
    obstacleType: 'car',
    inletVelocity: 0.08, // Mach / lattice units
    viscosity: 0.015,     // viscosity determines flow turbulence
    angleIndex: 0,        // Angle of Attack (deg)
    stepsPerFrame: 1,     // Speed multiplier
    obstacleScale: 1.0,
    nacaParams: {
      m: 0.02, // 2% camber
      p: 0.40, // max camber position
      t: 0.12, // 12% thickness
    },
  });

  // Default Visualization Settings
  const [visuals, setVisuals] = useState<VisualOptions>({
    showSmoke: true,
    showStreamlines: false,
    showVectors: false,
    showSlice: true,
    showSurfaceColor: true,
    showGround: true,
    sliceZ: 0,
    coloring: 'velocity',
    particleCount: 5000,
    particleSize: 0.3,
  });

  // Toggle ground when profile changes
  useEffect(() => {
    const groundTypes = ['car', 'train'];
    tweakVisual('showGround', groundTypes.includes(params.obstacleType));
  }, [params.obstacleType]);

  // Flow reset is handled by WindTunnelCanvas.placeObstacle (after obstacle mask is set)
  const resetFlow = () => {
    solver.reset(params.inletVelocity);
  };

  // State Change Updaters
  const tweakParam = <K extends keyof SimulationParams>(key: K, val: SimulationParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: val }));
  };

  const tweakNaca = <K extends keyof NacaParams>(key: K, val: NacaParams[K]) => {
    setParams((prev) => ({
      ...prev,
      nacaParams: { ...prev.nacaParams, [key]: val },
    }));
  };

  const tweakVisual = <K extends keyof VisualOptions>(key: K, val: VisualOptions[K]) => {
    setVisuals((prev) => ({ ...prev, [key]: val }));
  };

  // Shape Creation pipeline callbacks
  const handleCustomPointsCreated = (points: Point2D[]) => {
    setCustomPoints(points);
    if (points.length > 0) {
      tweakParam('obstacleType', 'custom');
    } else {
      tweakParam('obstacleType', 'circle'); // default back if cleared
    }
  };

  const handleUploadedImage = (img: HTMLImageElement | null) => {
    setUploadedImage(img);
    if (img) {
      tweakParam('obstacleType', 'uploaded');
    } else {
      tweakParam('obstacleType', 'circle');
    }
  };

  // Instability Auto-Recovery Tick
  useEffect(() => {
    const recoveryInterval = setInterval(() => {
      if (!solver.isStable) {
        console.warn("[App Manager] Active grid repaired from boundary divergence.");
        resetFlow();
      }
    }, 1000);
    return () => clearInterval(recoveryInterval);
  }, [params.inletVelocity]);

  return (
    <div id="wind-tunnel-app" className="w-full h-screen bg-slate-950 text-slate-100 font-sans select-none antialiased relative overflow-hidden">

      {/* Fullscreen 3D Viewport */}
      <WindTunnelCanvas
        solver={solver}
        params={params}
        visuals={visuals}
        isSimulating={isSimulating}
        customPoints={customPoints}
        onFpsUpdate={setFps}
      />

      {/* Floating top bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Wind size={16} className="text-emerald-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200">3D WIND TUNNEL</span>
          <span className="text-[9px] font-mono text-slate-500 hidden sm:inline">LBM {Nx}x{Ny}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 backdrop-blur-md border transition ${isSimulating ? 'bg-slate-950/70 text-amber-400 border-amber-500/25 hover:bg-slate-900/80' : 'bg-emerald-500/90 text-slate-950 border-emerald-400 hover:bg-emerald-400'}`}
          >
            {isSimulating ? <><Pause size={11} fill="currentColor" /> Pause</> : <><Play size={11} fill="currentColor" /> Resume</>}
          </button>
          <button
            onClick={resetFlow}
            className="px-3 py-1.5 bg-slate-950/70 backdrop-blur-md border border-slate-800/50 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      {/* Floating HUD — aerodynamic metrics */}
      {(() => {
        const Re = params.inletVelocity * 26 * (Nx / 120) / Math.max(params.viscosity, 0.001);
        const Ma = params.inletVelocity / (1 / Math.sqrt(3));
        const qDyn = 0.5 * 1.0 * params.inletVelocity * params.inletVelocity;
        return (
          <div className="absolute top-16 left-4 z-20 bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl px-3.5 py-2.5 pointer-events-none font-mono text-[11px] space-y-1 min-w-[160px]">
            <div className="text-[9px] text-slate-600 font-bold tracking-wider mb-1">AERODYNAMICS</div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">C_L</span><span className="text-emerald-400 font-semibold">{solver.lastLiftCoeff.toFixed(4)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">C_D</span><span className="text-amber-400 font-semibold">{solver.lastDragCoeff.toFixed(4)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">L/D</span><span className="text-slate-300">{solver.lastDragCoeff !== 0 ? (solver.lastLiftCoeff / solver.lastDragCoeff).toFixed(2) : '0.00'}</span></div>
            <div className="border-t border-slate-800/50 pt-1 mt-1 text-[9px] text-slate-600 font-bold tracking-wider mb-1">FLOW CONDITIONS</div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Re</span><span className="text-sky-400 font-semibold">{Re >= 1000 ? `${(Re/1000).toFixed(1)}k` : Re.toFixed(0)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Ma</span><span className="text-slate-300">{Ma.toFixed(3)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">q</span><span className="text-slate-300">{qDyn.toFixed(4)}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">U<sub>∞</sub></span><span className="text-slate-300">{(params.inletVelocity * 2000).toFixed(0)} km/h</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">ν</span><span className="text-slate-300">{params.viscosity.toFixed(4)}</span></div>
            <div className="border-t border-slate-800/50 pt-1 mt-1 flex justify-between gap-4"><span className="text-slate-500">FPS</span><span className={`font-semibold ${fps >= 30 ? 'text-emerald-400' : fps >= 15 ? 'text-amber-400' : 'text-rose-400'}`}>{fps}</span></div>
          </div>
        );
      })()}

      {/* Floating control panel — right side, collapsible */}
      <div className={`absolute top-4 right-4 bottom-4 z-20 transition-all duration-300 ${activeTab ? 'w-80' : 'w-10'}`}>
        {activeTab ? (
          <div className="h-full bg-slate-950/80 backdrop-blur-md border border-slate-800/50 rounded-2xl flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-slate-800/50 shrink-0">
              {(['controls', 'telemetry', 'theory'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-[10px] font-semibold transition ${activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tab === 'controls' ? 'Controls' : tab === 'telemetry' ? 'Telemetry' : 'Theory'}
                </button>
              ))}
              <button onClick={() => setActiveTab(null as any)} className="px-2.5 text-slate-600 hover:text-slate-300 text-xs">&times;</button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {activeTab === 'controls' && (
                <>
                  {/* Visualization */}
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Visualization</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                        <input type="checkbox" checked={visuals.showSmoke} onChange={(e) => tweakVisual('showSmoke', e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 bg-slate-900" />
                        Particles
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                        <input type="checkbox" checked={visuals.showSlice} onChange={(e) => tweakVisual('showSlice', e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 bg-slate-900" />
                        Flow Slice
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                        <input type="checkbox" checked={visuals.showGround} onChange={(e) => tweakVisual('showGround', e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 bg-slate-900" />
                        Ground
                      </label>
                    </div>
                    {visuals.showSmoke && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">Size</span>
                          <input type="range" min="0.05" max="3.0" step="0.05" value={visuals.particleSize} onChange={(e) => tweakVisual('particleSize', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-7 text-right">{visuals.particleSize.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">Density</span>
                          <input type="range" min="1000" max="100000" step="1000" value={visuals.particleCount} onChange={(e) => tweakVisual('particleCount', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{visuals.particleCount >= 1000 ? `${(visuals.particleCount/1000).toFixed(0)}k` : visuals.particleCount}</span>
                        </div>
                      </div>
                    )}
                    {visuals.showSlice && (
                      <select value={visuals.coloring} onChange={(e) => tweakVisual('coloring', e.target.value as any)} className="w-full bg-slate-900/80 border border-slate-800/50 text-slate-300 text-[11px] py-1.5 px-2 rounded-lg cursor-pointer">
                        <option value="velocity">Velocity Magnitude</option>
                        <option value="pressure">Pressure Field</option>
                        <option value="vorticity">Vorticity</option>
                      </select>
                    )}
                  </div>

                  {/* Model selector */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Aerodynamic Profile</span>
                    <select value={params.obstacleType} onChange={(e) => tweakParam('obstacleType', e.target.value as ObstacleType)} className="w-full bg-slate-900/80 border border-slate-800/50 text-slate-200 text-[11px] font-semibold py-2 px-2.5 rounded-lg cursor-pointer">
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
                    <ShapeCreator Nx={Nx} Ny={Ny} onCustomShapeCreated={handleCustomPointsCreated} onImageUploaded={handleUploadedImage} />
                  )}

                  {params.obstacleType.startsWith('naca') && (
                    <div className="space-y-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">NACA Parameters</span>
                      {([['Camber', 'm', 0, 0.09, 0.01, (v: number) => `${(v*100).toFixed(0)}%`],
                         ['Position', 'p', 0.1, 0.8, 0.1, (v: number) => `${(v*10).toFixed(0)}/10`],
                         ['Thickness', 't', 0.06, 0.25, 0.01, (v: number) => `${(v*100).toFixed(0)}%`]] as const).map(([label, key, min, max, step, fmt]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 w-16">{label}</span>
                          <input type="range" min={min} max={max} step={step} value={params.nacaParams[key]} onChange={(e) => tweakNaca(key, parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                          <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{fmt(params.nacaParams[key])}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fluid parameters */}
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Fluid Parameters</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">AoA</span>
                      <input type="range" min="-30" max="30" step="1" value={params.angleIndex} onChange={(e) => tweakParam('angleIndex', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.angleIndex}°</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Velocity</span>
                      <input type="range" min="0" max="0.15" step="0.005" value={params.inletVelocity} onChange={(e) => tweakParam('inletVelocity', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">{(params.inletVelocity * 2000).toFixed(0)} km/h</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Viscosity</span>
                      <input type="range" min="0" max="100" step="1"
                        value={Math.round(Math.log(params.viscosity / 0.002) / Math.log(0.5 / 0.002) * 100)}
                        onChange={(e) => { const t = parseFloat(e.target.value) / 100; tweakParam('viscosity', parseFloat((0.002 * Math.pow(0.5 / 0.002, t)).toFixed(4))); }}
                        className="flex-1 accent-emerald-500 h-1 cursor-pointer"
                      />
                      <span className="text-[10px] text-emerald-400 font-mono w-14 text-right">
                        {params.viscosity <= 0.005 ? 'air' : params.viscosity >= 0.35 ? 'honey' : params.viscosity >= 0.1 ? 'oil' : params.viscosity >= 0.03 ? 'water' : (params.viscosity * 1000).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Steps/F</span>
                      <input type="range" min="1" max="16" step="1" value={params.stepsPerFrame} onChange={(e) => tweakParam('stepsPerFrame', parseInt(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.stepsPerFrame}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-16">Scale</span>
                      <input type="range" min="0.5" max="2.0" step="0.1" value={params.obstacleScale} onChange={(e) => tweakParam('obstacleScale', parseFloat(e.target.value))} className="flex-1 accent-emerald-500 h-1 cursor-pointer" />
                      <span className="text-[10px] text-emerald-400 font-mono w-10 text-right">{params.obstacleScale.toFixed(1)}x</span>
                    </div>
                  </div>

                  {/* Fluid presets */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Fluid Preset</span>
                    <div className="flex flex-wrap gap-1.5">
                      {([['Air', 0.002], ['Water', 0.035], ['Oil', 0.15], ['Honey', 0.45]] as const).map(([name, v]) => (
                        <button key={name} onClick={() => tweakParam('viscosity', v)}
                          className={`px-2 py-1 text-[10px] font-semibold rounded-md border transition ${
                            Math.abs(params.viscosity - v) < 0.005
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-900/50 text-slate-500 border-slate-800/50 hover:text-slate-300'
                          }`}
                        >{name}</button>
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
          <button
            onClick={() => setActiveTab('controls')}
            className="bg-slate-950/70 backdrop-blur-md border border-slate-800/50 rounded-xl p-2.5 text-slate-400 hover:text-emerald-400 transition"
          >
            <Settings size={16} />
          </button>
        )}
      </div>

    </div>
  );
}
