/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen, Compass, Info, HelpCircle } from 'lucide-react';

export default function EducationalPanel() {
  return (
    <div id="educational-panel" className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col gap-5 text-slate-300">
      
      {/* Header Description */}
      <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm" id="edu-header">
        <BookOpen size={15} />
        <span>AERODYNAMICS & FLUID PHYSICS LAB GUIDE</span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-slate-400" id="edu-desc">
        Welcome to the virtual **3D Wind Tunnel Simulator**. This application runs a real-time, physics-based fluid dynamics simulation solving the **Navier-Stokes equations** via a **Lattice Boltzmann Method (LBM)** approximation. Below is the science driving this laboratory environment:
      </p>

      {/* Physics Modules */}
      <div className="flex flex-col gap-4 text-xs font-sans leading-relaxed" id="edu-topics">
        
        {/* Module 1: The LBM Engine */}
        <div className="flex flex-col gap-1 border-l-2 border-emerald-500 pl-3" id="topic-lbm">
          <h4 className="font-semibold text-slate-100 flex items-center gap-1.5" id="topic-lbm-title">
            <Info size={13} className="text-emerald-400" />
            Lattice Boltzmann Method (D2Q9)
          </h4>
          <p className="text-slate-400 text-[11px] mt-0.5">
            Instead of solving partial differential fluids directly, **LBM** models imaginary fluid packets moving across a grid with nine discrete velocities ($D2Q9$). At each timestep, packets stream to neighboring cells (**Streaming**) and exchange momentum by relaxing toward local equilibrium velocities (**Collision**). Standard no-slip walls use clean **bounce-back** rules to redirect packets back the way they came, simulating viscous drag automatically.
          </p>
        </div>

        {/* Module 2: Mechanics of Lift */}
        <div className="flex flex-col gap-1 border-l-2 border-sky-400 pl-3" id="topic-lift">
          <h4 className="font-semibold text-slate-100 flex items-center gap-1.5" id="topic-lift-title">
            <Compass size={13} className="text-sky-450" />
            Generating Aerodynamic Lift
          </h4>
          <p className="text-slate-400 text-[11px] mt-0.5">
            Aerodynamic lift is caused by two complementary physical laws:
            <br />
            1. **Bernoulli's Principle (Pressure Differential)**: Fluid packets traveling over a curved airfoil's upper edge are squeezed together and accelerate. High velocity creates a low pressure suction zone. The higher pressure underneath pushes the wing up.
            <br />
            2. **Newton's Third Law (Momentum Turning)**: The wing redirects the oncoming air downwards. The downward momentum exchange on the air exerts an equal and opposite upward lift force on the wing.
          </p>
        </div>

        {/* Module 3: Von Kármán Vortex Streets */}
        <div className="flex flex-col gap-1 border-l-2 border-amber-400 pl-3" id="topic-vortices">
          <h4 className="font-semibold text-slate-100 flex items-center gap-1.5" id="topic-vortices-title">
            <HelpCircle size={13} className="text-amber-500" />
            Von Kármán Vortex Street & Stalling
          </h4>
          <p className="text-slate-400 text-[11px] mt-0.5">
            When fluid meets a blunt object like a cylinder, it can't adhere to the high-angle rear slopes. The boundary layers detach, generating alternating clockwise and counter-clockwise swirling eddies. These periodic spirals detach in a gorgeous chain called the **von Kármán Vortex Street**. 
            <br />
            If you rotate an airfoil past a critical angle (the **Stall Point**), the flow breaks off completely from the upper surface. Lift of the wing falls off, and drag rises sharply, causing stalls.
          </p>
        </div>

      </div>

      <div className="h-[1px] bg-slate-800" id="edu-footer-divider"></div>
      <div className="text-[10.5px] italic text-slate-500 font-mono" id="edu-credit">
        Aerodynamics Lab simulator built on clean WebGL Core. Click orbit cameras to inspect vortex patterns in 3D.
      </div>
    </div>
  );
}
