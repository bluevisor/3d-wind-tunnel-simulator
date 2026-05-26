/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { AreaChart, Compass, Leaf, ShieldAlert, Wind } from 'lucide-react';
import { LBMSolver } from '../lbmSolver';
import { SimulationParams } from '../types';

interface AnalyticsPanelProps {
  solver: LBMSolver;
  params: SimulationParams;
  isSimulating: boolean;
}

export default function AnalyticsPanel({
  solver,
  params,
  isSimulating,
}: AnalyticsPanelProps) {
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Historical data buffers for scrolling charts
  const liftHistoryRef = useRef<number[]>([]);
  const dragHistoryRef = useRef<number[]>([]);
  const maxHistoryPoints = 120; // 2 seconds of history

  const [, setTick] = useState(0);

  // Poll physical outcomes to update numerical panel gauges periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 150); // 6.6 Hz update rate for high-responsiveness
    return () => clearInterval(interval);
  }, []);

  // Capture metrics and draw rolling telemetry charts at 60 FPS
  useEffect(() => {
    let animId: number;

    const updateChart = () => {
      animId = requestAnimationFrame(updateChart);

      if (isSimulating) {
        // Record current values to history
        const cl = solver.lastLiftCoeff;
        const cd = solver.lastDragCoeff;

        // Keep numbers in sane physical limits for visual plotting
        const cleanCl = Number.isNaN(cl) || !Number.isFinite(cl) ? 0 : cl;
        const cleanCd = Number.isNaN(cd) || !Number.isFinite(cd) ? 0 : cd;

        liftHistoryRef.current.push(cleanCl);
        dragHistoryRef.current.push(cleanCd);

        if (liftHistoryRef.current.length > maxHistoryPoints) {
          liftHistoryRef.current.shift();
          dragHistoryRef.current.shift();
        }
      }

      // Render the rolling vector telemetry chart
      drawChartCanvas();
    };

    animId = requestAnimationFrame(updateChart);
    return () => cancelAnimationFrame(animId);
  }, [isSimulating]);

  const drawChartCanvas = () => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear slate
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw horizontal zero line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const centerY = height * 0.65; // Offset zero downward to provide headroom for high positive lift coefficients
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Horizontal grids
    ctx.strokeStyle = '#0f172a';
    const gridY1 = centerY - height * 0.25;
    const gridY2 = centerY + height * 0.15;
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, gridY1); ctx.lineTo(width, gridY1);
    ctx.moveTo(0, gridY2); ctx.lineTo(width, gridY2);
    ctx.stroke();
    ctx.setLineDash([]);

    const clHistory = liftHistoryRef.current;
    const cdHistory = dragHistoryRef.current;
    if (clHistory.length < 2) {
      // Draw empty guide labels
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText('WAITING FOR AERODYNAMIC TELEMETRY FLOW...', 20, height / 2);
      return;
    }

    // Auto-scale vertical limits
    let maxAmp = 0.5;
    for (let i = 0; i < clHistory.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(clHistory[i]), Math.abs(cdHistory[i]));
    }
    // Boost padding limit
    maxAmp *= 1.25;

    const mapValueToY = (val: number) => {
      // invert coordinates
      const norm = val / maxAmp; // value ratio
      return centerY - norm * (height * 0.4); 
    };

    const stepX = width / (maxHistoryPoints - 1);

    // 1. Plot Lift Coefficient line (Neon Green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, mapValueToY(clHistory[0]));
    for (let i = 1; i < clHistory.length; i++) {
      const idx = maxHistoryPoints - clHistory.length + i;
      ctx.lineTo(idx * stepX, mapValueToY(clHistory[i]));
    }
    ctx.stroke();

    // 2. Plot Drag Coefficient line (Crimson Red)
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, mapValueToY(cdHistory[0]));
    for (let i = 1; i < cdHistory.length; i++) {
      const idx = maxHistoryPoints - cdHistory.length + i;
      ctx.lineTo(idx * stepX, mapValueToY(cdHistory[i]));
    }
    ctx.stroke();

    // Axis Legend Labels
    ctx.fillStyle = '#10b981';
    ctx.font = '9px monospace';
    ctx.fillText(`C_L Lift coeff: ${clHistory[clHistory.length - 1].toFixed(3)}`, 8, 14);

    ctx.fillStyle = '#f87171';
    ctx.fillText(`C_D Drag coeff: ${cdHistory[cdHistory.length - 1].toFixed(3)}`, 8, 26);

    ctx.fillStyle = '#475569';
    ctx.fillText(`Grid Scale: ±${maxAmp.toFixed(1)}`, width - 96, 14);
  };

  // Physical classification parameters
  const reynoldsNumber = Math.max(
    0,
    Math.round((params.inletVelocity * 15) / params.viscosity)
  );

  let flowRegime = 'Laminar (Smooth, stable layers)';
  let flowLevelColor = 'text-green-400';
  if (reynoldsNumber > 1200) {
    flowRegime = 'Highly Turbulent Wake (Chaotic, high-drag eddies)';
    flowLevelColor = 'text-red-400';
  } else if (reynoldsNumber > 100) {
    flowRegime = 'Vortex Street (von Kármán shedding circles)';
    flowLevelColor = 'text-amber-400 font-semibold';
  }

  const liftToDrag = solver.lastDragCoeff > 1e-4 ? solver.lastLiftCoeff / solver.lastDragCoeff : 0;
  
  let efficiencyDescription = 'Low drag deflection';
  let efficiencyColor = 'text-slate-400';
  if (liftToDrag > 8) {
    efficiencyDescription = 'Superb Glider Efficiency (High Lift, Minimum Drag)';
    efficiencyColor = 'text-emerald-400 font-bold';
  } else if (liftToDrag > 3) {
    efficiencyDescription = 'Aviation Flight Efficiency (Excellent lift lift profile)';
    efficiencyColor = 'text-emerald-500 font-semibold';
  } else if (liftToDrag < -3) {
    efficiencyDescription = 'High Aerodynamic Downforce (Perfect for Racing Wings!)';
    efficiencyColor = 'text-rose-400 font-bold';
  } else if (Math.abs(liftToDrag) < 1.0) {
    efficiencyDescription = 'Aerodynamically Inefficient Bluff Body Profile';
    efficiencyColor = 'text-slate-500';
  }

  return (
    <div id="analytics-telemetry" className="flex flex-col gap-4">
      {/* 1. Real-time Scrolling telemetry charts */}
      <div id="telemetry-chart-container" className="flex flex-col gap-2 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
        <label className="text-slate-400 text-xs font-mono font-bold flex items-center gap-1.5" id="telemetry-lbl">
          <AreaChart size={13} className="text-emerald-500" />
          <span>CYBERPHYSICAL COEFFICIENTS HISTOGRAM (C_L & C_D vs TIME)</span>
        </label>
        <canvas
          id="scroll-chart"
          ref={chartCanvasRef}
          width={400}
          height={150}
          className="w-full h-[150px] rounded-lg border border-slate-900 bg-slate-950"
        ></canvas>
      </div>

      {/* 2. Numerical gauges and physics insights */}
      <div id="physics-meters" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Reynolds Number Block */}
        <div id="reynolds-meter" className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex gap-3">
          <div className="bg-slate-950 p-2.5 rounded-lg text-amber-500 border border-slate-800 h-fit" id="reynolds-icon-bg">
            <Wind size={18} />
          </div>
          <div className="flex flex-col min-w-0" id="reynolds-text">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">Reynolds Code (Re)</span>
            <span className="text-2xl font-bold font-mono text-slate-100" id="reynolds-val">
              {reynoldsNumber}
            </span>
            <span className={`text-[11px] truncate whitespace-nowrap mt-1 ${flowLevelColor}`} id="reynolds-regime">
              {flowRegime}
            </span>
          </div>
        </div>

        {/* Lift-to-Drag Aerodynamic Ratio Block */}
        <div id="ld-meter" className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex gap-3">
          <div className="bg-slate-950 p-2.5 rounded-lg text-emerald-400 border border-slate-800 h-fit" id="ld-icon-bg">
            <Compass size={18} />
          </div>
          <div className="flex flex-col min-w-0" id="ld-text">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">L/D Glide Ratio</span>
            <span className="text-2xl font-bold font-mono text-slate-100" id="ld-val">
              {liftToDrag.toFixed(3)}
            </span>
            <span className={`text-[11px] truncate mt-1 ${efficiencyColor}`} id="ld-regime">
              {efficiencyDescription}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Detailed Forces Breakdown table */}
      <div id="forces-table" className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2 text-xs font-mono text-slate-400">
        <span className="text-[10px] text-slate-500 font-bold" id="diagnostic-header">FLUID SURFACE SURFACE FORCE DIAGNOSTICS</span>
        
        <div className="flex justify-between py-1 border-b border-slate-900" id="row-raw-lift">
          <span>X-axis Drag force (F_D):</span>
          <span className="text-red-400 font-semibold" id="raw-drag-val">
            {solver.lastDragForce.toFixed(5)} lattice force units
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-slate-900" id="row-raw-drag">
          <span>Y-axis Lift force (F_L):</span>
          <span className={`font-semibold ${solver.lastLiftForce >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} id="raw-lift-val">
            {solver.lastLiftForce.toFixed(5)} lattice force units
          </span>
        </div>
        <div className="flex justify-between py-1 border-b border-slate-900" id="row-relax">
          <span>LBM Relaxation Parameter (τ):</span>
          <span className="text-slate-350" id="relax-val">
            {(3.0 * params.viscosity + 0.5).toFixed(4)} s
          </span>
        </div>
        <div className="flex justify-between py-1" id="row-vort">
          <span>Kinematic Viscosity (ν):</span>
          <span className="text-slate-300" id="visc-val">
            {params.viscosity.toFixed(5)}
          </span>
        </div>
      </div>

      {/* Aerodynamic Stall Indicator warning if Angle of Attack is too high */}
      {Math.abs(params.angleIndex) > 16 && params.obstacleType.startsWith('naca') && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-orange-950/40 border border-orange-900 text-orange-400" id="stall-warning">
          <ShieldAlert size={16} className="shrink-0" />
          <div className="text-[11px] flex flex-col font-sans" id="stall-text">
            <span className="font-bold underline" id="stall-title">STALL BOUNDARY EXCEEDED</span>
            <span id="stall-desc">Wing boundary layer flow separation is fully detached. Aerodynamic Lift force has crashed, and drag coefficient has spiked. Reduce Angle of Attack below 15° to recover laminar grip!</span>
          </div>
        </div>
      )}
    </div>
  );
}
