/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NacaParams, ObstacleType, Point2D } from './types';

function cubicBezier(
  p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, steps: number
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    });
  }
  return pts;
}

export function getTeslaModel3Points(scale: number): Point2D[] {
  const s = scale;
  const pts: Point2D[] = [];

  // Tesla Model 3 — actual proportions (length ~4694mm, height ~1443mm, wheelbase 2875mm)
  // Normalized to w=24 units base, aspect ratio ~3.25:1
  const w = s * 24;
  const h = s * 7.4;
  const ground = -h * 0.45;
  const roof = h * 0.55;

  // Start at rear bottom (going clockwise — front is +x)
  // Flat underbody (front to rear)
  pts.push({ x: w * 0.48, y: ground });
  pts.push({ x: -w * 0.48, y: ground });

  // Rear bumper corner (small radius)
  pts.push(...cubicBezier(
    { x: -w * 0.48, y: ground },
    { x: -w * 0.50, y: ground },
    { x: -w * 0.50, y: ground + h * 0.08 },
    { x: -w * 0.50, y: ground + h * 0.15 },
    8
  ).slice(1));

  // Rear face up to tail light
  pts.push({ x: -w * 0.49, y: ground + h * 0.45 });

  // Trunk lip / rear deck (short, distinctive Model 3 ducktail)
  pts.push(...cubicBezier(
    { x: -w * 0.49, y: ground + h * 0.45 },
    { x: -w * 0.47, y: ground + h * 0.52 },
    { x: -w * 0.40, y: ground + h * 0.56 },
    { x: -w * 0.34, y: ground + h * 0.62 },
    10
  ).slice(1));

  // Rear window (steep rake, Model 3's glass roof flowing into rear window)
  pts.push(...cubicBezier(
    { x: -w * 0.34, y: ground + h * 0.62 },
    { x: -w * 0.26, y: ground + h * 0.78 },
    { x: -w * 0.18, y: ground + h * 0.92 },
    { x: -w * 0.08, y: roof },
    12
  ).slice(1));

  // Glass roof (very subtle arch, almost flat — signature Tesla)
  pts.push(...cubicBezier(
    { x: -w * 0.08, y: roof },
    { x: w * 0.02, y: roof + h * 0.015 },
    { x: w * 0.12, y: roof + h * 0.01 },
    { x: w * 0.18, y: roof - h * 0.01 },
    12
  ).slice(1));

  // Windshield (steeply raked — Model 3 has ~30° windshield angle)
  pts.push(...cubicBezier(
    { x: w * 0.18, y: roof - h * 0.01 },
    { x: w * 0.24, y: roof - h * 0.10 },
    { x: w * 0.30, y: roof - h * 0.30 },
    { x: w * 0.34, y: roof - h * 0.50 },
    12
  ).slice(1));

  // Hood (very low, almost flat — EV frunk, no engine)
  pts.push(...cubicBezier(
    { x: w * 0.34, y: roof - h * 0.50 },
    { x: w * 0.37, y: roof - h * 0.56 },
    { x: w * 0.42, y: roof - h * 0.58 },
    { x: w * 0.48, y: roof - h * 0.59 },
    10
  ).slice(1));

  // Front fascia (smooth drop to bumper)
  pts.push(...cubicBezier(
    { x: w * 0.48, y: roof - h * 0.59 },
    { x: w * 0.50, y: roof - h * 0.62 },
    { x: w * 0.50, y: ground + h * 0.12 },
    { x: w * 0.48, y: ground },
    10
  ).slice(1));

  return pts;
}

export function getShinkansenPoints(scale: number): Point2D[] {
  const s = scale;
  const pts: Point2D[] = [];

  const w = s * 26;
  const h = s * 8;
  const noseLen = w * 0.45;

  // Rear face
  pts.push({ x: -w * 0.50, y: -h * 0.50 });
  pts.push({ x: -w * 0.50, y: h * 0.42 });

  // Rear top corner
  pts.push(...cubicBezier(
    { x: -w * 0.50, y: h * 0.42 },
    { x: -w * 0.50, y: h * 0.50 },
    { x: -w * 0.48, y: h * 0.50 },
    { x: -w * 0.45, y: h * 0.50 },
    6
  ).slice(1));

  // Roof
  pts.push({ x: w * 0.50 - noseLen, y: h * 0.50 });

  // Nose top — long gradual droop from roof to nose tip
  pts.push(...cubicBezier(
    { x: w * 0.50 - noseLen, y: h * 0.50 },
    { x: w * 0.50 - noseLen * 0.45, y: h * 0.42 },
    { x: w * 0.50 - noseLen * 0.15, y: h * 0.10 },
    { x: w * 0.50, y: -h * 0.08 },
    24
  ).slice(1));

  // Nose tip — sharp duckbill curving under
  pts.push(...cubicBezier(
    { x: w * 0.50, y: -h * 0.08 },
    { x: w * 0.502, y: -h * 0.14 },
    { x: w * 0.498, y: -h * 0.20 },
    { x: w * 0.48, y: -h * 0.24 },
    8
  ).slice(1));

  // Nose underside — curves back to meet the flat underbody
  pts.push(...cubicBezier(
    { x: w * 0.48, y: -h * 0.24 },
    { x: w * 0.50 - noseLen * 0.35, y: -h * 0.42 },
    { x: w * 0.50 - noseLen * 0.65, y: -h * 0.49 },
    { x: w * 0.50 - noseLen, y: -h * 0.50 },
    16
  ).slice(1));

  // Flat underbody
  pts.push({ x: -w * 0.50, y: -h * 0.50 });

  return pts;
}

// D2Q9 Constants
export const DX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
export const DY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
export const WEIGHTS = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
export const OPPOSITE = [0, 3, 4, 1, 2, 7, 8, 5, 6];

// Helper to generate NACA Airfoil points
export function getNacaPoints(m: number, p: number, t: number, chord: number): Point2D[] {
  const N = 80;
  const upper: Point2D[] = [];
  const lower: Point2D[] = [];

  for (let i = 0; i <= N; i++) {
    const xFrac = (1 - Math.cos((Math.PI * i) / N)) / 2; // Cosine clustering for high res at nose
    const x = xFrac * chord;

    // Calculate camber yc and camber slope
    let yc = 0;
    let slope = 0;
    if (p > 0) {
      if (xFrac <= p) {
        yc = (m / (p * p)) * (2 * p * xFrac - xFrac * xFrac);
        slope = ((2 * m) / (p * p)) * (p - xFrac);
      } else {
        yc = (m / Math.pow(1 - p, 2)) * ((1 - 2 * p) + 2 * p * xFrac - xFrac * xFrac);
        slope = ((2 * m) / Math.pow(1 - p, 2)) * (p - xFrac);
      }
    }
    yc *= chord;

    // Calculate thickness
    const yt = 5 * t * chord * (
      0.2969 * Math.sqrt(xFrac) -
      0.1260 * xFrac -
      0.3516 * xFrac * xFrac +
      0.2843 * Math.pow(xFrac, 3) -
      0.1015 * Math.pow(xFrac, 4)
    );

    const theta = Math.atan(slope);

    // Center of rotation is at 25% chord (aerodynamic center)
    const rx = x - 0.25 * chord;

    upper.push({
      x: rx - yt * Math.sin(theta),
      y: yc + yt * Math.cos(theta),
    });

    if (i > 0 && i < N) {
      lower.push({
        x: rx + yt * Math.sin(theta),
        y: yc - yt * Math.cos(theta),
      });
    }
  }

  // Combine to form path
  const points: Point2D[] = [];
  for (let i = N; i >= 0; i--) {
    points.push(upper[i]);
  }
  for (let i = 0; i < lower.length; i++) {
    points.push(lower[i]);
  }
  points.push(upper[N]); // Close the shape

  return points;
}

export class LBMSolver {
  public Nx: number;
  public Ny: number;
  
  // Grid buffers (flat arrays of sizes Nx * Ny * 9)
  public f: Float32Array;
  public fTemp: Float32Array;
  
  // Macroscopic quantities
  public rho: Float32Array;
  public ux: Float32Array;
  public uy: Float32Array;
  public obstacle: Uint8Array; // 1 for obstacle, 0 for fluid
  
  // Visualization helpers
  public speed: Float32Array;
  public pressure: Float32Array;
  public vorticity: Float32Array;

  // Ground effect: solid wall at this Y row (-1 = disabled, uses tunnel bottom)
  public groundRow: number = -1;

  // Real-time coefficients
  public lastLiftForce: number = 0;
  public lastDragForce: number = 0;
  public lastLiftCoeff: number = 0;
  public lastDragCoeff: number = 0;

  // Stats
  public isStable: boolean = true;

  constructor(Nx: number, Ny: number) {
    this.Nx = Nx;
    this.Ny = Ny;

    this.f = new Float32Array(Nx * Ny * 9);
    this.fTemp = new Float32Array(Nx * Ny * 9);
    this.rho = new Float32Array(Nx * Ny);
    this.ux = new Float32Array(Nx * Ny);
    this.uy = new Float32Array(Nx * Ny);
    this.speed = new Float32Array(Nx * Ny);
    this.pressure = new Float32Array(Nx * Ny);
    this.vorticity = new Float32Array(Nx * Ny);
    this.obstacle = new Uint8Array(Nx * Ny);

    this.reset(0.08); // default inlet speed
  }

  /**
   * Clears grid distributions and returns fluids to horizontal inlet flow.
   */
  public reset(u0: number): void {
    const Nx = this.Nx;
    const Ny = this.Ny;
    this.isStable = true;
    this.lastLiftForce = 0;
    this.lastDragForce = 0;
    this.lastLiftCoeff = 0;
    this.lastDragCoeff = 0;

    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        const cIdx = y * Nx + x;
        const isObs = this.obstacle[cIdx] === 1;
        const r = 1.0;
        const vx = isObs ? 0.0 : u0;
        const vy = 0.0;

        this.rho[cIdx] = r;
        this.ux[cIdx] = vx;
        this.uy[cIdx] = vy;
        this.speed[cIdx] = isObs ? 0.0 : vx;
        this.pressure[cIdx] = r / 3.0;
        this.vorticity[cIdx] = 0.0;

        const fIdx = cIdx * 9;
        const feq = this.getEquilibrium(r, vx, vy);
        for (let i = 0; i < 9; i++) {
          this.f[fIdx + i] = feq[i];
          this.fTemp[fIdx + i] = feq[i];
        }
      }
    }
  }

  /**
   * Evaluates the local equilibrium distribution.
   */
  private getEquilibrium(r: number, vx: number, vy: number): number[] {
    const feq = new Array(9);
    const u2 = vx * vx + vy * vy;
    
    feq[0] = WEIGHTS[0] * r * (1.0 - 1.5 * u2);

    for (let i = 1; i < 9; i++) {
      const udot = DX[i] * vx + DY[i] * vy;
      feq[i] = WEIGHTS[i] * r * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2);
    }
    return feq;
  }

  /**
   * Draw the obstacle mask dynamically of size (Nx, Ny) based on preset or custom canvases.
   */
  public setObstacle(
    type: ObstacleType,
    angleDeg: number,
    scale: number,
    nacaParams: NacaParams,
    customPoints: Point2D[] | null,
    uploadedImg: HTMLImageElement | null
  ): void {
    const Nx = this.Nx;
    const Ny = this.Ny;

    // Reset obstacle mask
    this.obstacle.fill(0);

    const canvas = document.createElement('canvas');
    canvas.width = Nx;
    canvas.height = Ny;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, Nx, Ny);

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';

    // Scale all obstacle sizes proportionally to grid resolution
    const gs = Nx / 120;
    ctx.lineWidth = 1.5 * gs;

    const cx = Nx / 3.5;
    const cy = Ny / 2;
    const angleRad = (angleDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, -1);
    ctx.rotate(angleRad);

    if (type.startsWith('naca')) {
      let m = nacaParams.m;
      let p = nacaParams.p;
      let t = nacaParams.t;
      if (type === 'naca0012') { m = 0.0; p = 0.0; t = 0.12; }
      else if (type === 'naca2412') { m = 0.02; p = 0.4; t = 0.12; }
      else if (type === 'naca4412') { m = 0.04; p = 0.4; t = 0.12; }

      const chord = scale * 26 * gs;
      const points = getNacaPoints(m, p, t, chord);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

    } else if (type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, scale * 6.5 * gs, 0, Math.PI * 2);
      ctx.fill();

    } else if (type === 'flat_plate') {
      const length = scale * 22 * gs;
      const height = 1.6 * gs;
      ctx.fillRect(-length / 2, -height / 2, length, height);

    } else if (type === 'car') {
      const points = getTeslaModel3Points(scale * gs * 26 / 24);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

    } else if (type === 'train') {
      const points = getShinkansenPoints(scale * gs);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

    } else if (type === 'custom' && customPoints && customPoints.length > 0) {
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(customPoints[0].x, customPoints[0].y);
      for (let i = 1; i < customPoints.length; i++) ctx.lineTo(customPoints[i].x, customPoints[i].y);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'uploaded' && uploadedImg) {
      const boxSize = scale * 20 * gs;
      ctx.drawImage(uploadedImg, -boxSize / 2, -boxSize / 2, boxSize, boxSize);
    }

    ctx.restore();

    // Read mask with vertical flip mapping so the canvas maps perfectly to LBM grid
    const imgData = ctx.getImageData(0, 0, Nx, Ny);
    const pix = imgData.data;

    for (let y = 0; y < Ny; y++) {
      const canvasY = Ny - 1 - y; // top of canvas maps to top of tunnel, bottom of canvas to bottom of tunnel
      for (let x = 0; x < Nx; x++) {
        const cIdx = y * Nx + x;
        const pIdx = (canvasY * Nx + x) * 4;
        // White threshold: if any color channel exceeds 127, it's obstacle
        if (pix[pIdx] > 127 || pix[pIdx + 1] > 127 || pix[pIdx + 2] > 127) {
          this.obstacle[cIdx] = 1;
        }
      }
    }
  }

  /**
   * Performs single time-step of Lattice Boltzmann Method (D2Q9)
   */
  public step(u0: number, viscosity: number): void {
    if (!this.isStable) return;

    const Nx = this.Nx;
    const Ny = this.Ny;
    const omega = Math.min(1.0 / (3.0 * viscosity + 0.5), 1.95);

    // 1. MACROSCOPIC VALUES & COLLISION
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        const cIdx = y * Nx + x;
        const fIdx = cIdx * 9;

        // Skip calculations inside obstacle, save compute
        if (this.obstacle[cIdx] === 1) {
          this.rho[cIdx] = 0.0;
          this.ux[cIdx] = 0.0;
          this.uy[cIdx] = 0.0;
          this.speed[cIdx] = 0.0;
          this.pressure[cIdx] = 0.0;
          continue;
        }

        // Compute local density (rho) and velocities (ux, uy)
        let r = 0.0;
        let vx = 0.0;
        let vy = 0.0;

        for (let i = 0; i < 9; i++) {
          const val = this.f[fIdx + i];
          r += val;
          vx += val * DX[i];
          vy += val * DY[i];
        }

        // Avoid division by zero
        if (r > 1e-6) {
          vx /= r;
          vy /= r;
        } else {
          r = 1.0;
          vx = 0;
          vy = 0;
        }

        if (Number.isNaN(vx) || Number.isNaN(vy) || r > 5.0 || r < 0.05 || Math.abs(vx) > 0.8 || Math.abs(vy) > 0.8) {
          this.isStable = false;
          return;
        }

        this.rho[cIdx] = r;
        this.ux[cIdx] = vx;
        this.uy[cIdx] = vy;
        this.speed[cIdx] = Math.sqrt(vx * vx + vy * vy);
        this.pressure[cIdx] = r / 3.0;

        // Update distribution: Collision
        const u2 = vx * vx + vy * vy;
        
        // Zero-coordinate distribution equilibrium
        const feq0 = WEIGHTS[0] * r * (1.0 - 1.5 * u2);
        this.f[fIdx + 0] = this.f[fIdx + 0] - omega * (this.f[fIdx + 0] - feq0);

        for (let i = 1; i < 9; i++) {
          const udot = DX[i] * vx + DY[i] * vy;
          const feq = WEIGHTS[i] * r * (1.0 + 3.0 * udot + 4.5 * udot * udot - 1.5 * u2);
          this.f[fIdx + i] = this.f[fIdx + i] - omega * (this.f[fIdx + i] - feq);
        }
      }
    }

    // 2. STREAMING & PHYSICAL BOUNDARIES (Bounce-back)
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        const cIdx = y * Nx + x;
        const fIdx = cIdx * 9;

        if (this.obstacle[cIdx] === 1) continue;

        for (let i = 0; i < 9; i++) {
          const currentVal = this.f[fIdx + i];

          const nextX = x + DX[i];
          const nextY = y + DY[i];

          // Out-of-bounds safety boundary (top/bottom wall bounce, inlet/outlet flow)
          const effectiveBottom = this.groundRow >= 0 ? this.groundRow : 0;
          if (nextY < effectiveBottom || nextY >= Ny) {
            const oppIdx = OPPOSITE[i];
            this.fTemp[fIdx + oppIdx] = currentVal;
            continue;
          }

          if (nextX < 0) {
            // Left boundary is constant inflow: set directly in copy-phase
            continue;
          }

          if (nextX >= Nx) {
            // Right outlet boundary is handled below via zero-gradient extrapolation
            continue;
          }

          // Interior obstacles bounce-back
          const destIdx = nextY * Nx + nextX;
          if (this.obstacle[destIdx] === 1) {
            // Reverse velocity direction on obstacle boundaries
            const oppIdx = OPPOSITE[i];
            this.fTemp[fIdx + oppIdx] = currentVal;
          } else {
            // standard stream
            const nextFIdx = destIdx * 9;
            this.fTemp[nextFIdx + i] = currentVal;
          }
        }
      }
    }

    // 3. APPLY INLET/OUTLET DOMAINS & RESTORE BUFFER
    // Inlet (Left Columns): x = 0
    for (let y = 0; y < Ny; y++) {
      const cIdx = y * Nx;
      const fIdx = cIdx * 9;
      const feq = this.getEquilibrium(1.0, u0, 0.0);
      for (let i = 0; i < 9; i++) {
        this.fTemp[fIdx + i] = feq[i];
      }
    }

    // Outlet (Right Columns): x = Nx - 1
    // extrapolation (zero-gradient boundary)
    for (let y = 0; y < Ny; y++) {
      const targetIdx = (y * Nx + (Nx - 1)) * 9;
      const originIdx = (y * Nx + (Nx - 2)) * 9;
      for (let i = 0; i < 9; i++) {
        this.fTemp[targetIdx + i] = this.fTemp[originIdx + i];
      }
    }

    // Swap buffers (Double Buffering)
    const tempRef = this.f;
    this.f = this.fTemp;
    this.fTemp = tempRef;

    // 4. CALCULATE VORTICITY FIELD
    // vorticity = d(uy)/dx - d(ux)/dy
    for (let y = 1; y < Ny - 1; y++) {
      for (let x = 1; x < Nx - 1; x++) {
        const cIdx = y * Nx + x;
        if (this.obstacle[cIdx] === 1) {
          this.vorticity[cIdx] = 0.0;
          continue;
        }

        const uyDiffX = this.uy[cIdx + 1] - this.uy[cIdx - 1];
        const uxDiffY = this.ux[cIdx + Nx] - this.ux[cIdx - Nx];
        this.vorticity[cIdx] = 0.5 * (uyDiffX - uxDiffY);
      }
    }

    // 5. COMPUTE AERODYNAMIC LIFT & DRAG FORCES via Momentum Exchange Summation
    let liftSum = 0.0;
    let dragSum = 0.0;

    for (let y = 1; y < Ny - 1; y++) {
      for (let x = 1; x < Nx - 1; x++) {
        const cIdx = y * Nx + x;

        // Sum momentum exchange on boundary cell edges
        if (this.obstacle[cIdx] === 1) {
          for (let i = 1; i < 9; i++) {
            const nextX = x + DX[i];
            const nextY = y + DY[i];
            const neighborIdx = nextY * Nx + nextX;

            // Neighbor is a fluid cell
            if (this.obstacle[neighborIdx] === 0) {
              const fIdx = neighborIdx * 9;
              // Bounce momentum exchange on obstacle wall
              const outgoingDist = this.f[fIdx + i];             // going into obstacle
              const incomingDist = this.f[fIdx + OPPOSITE[i]];    // returned into fluid

              // Momentum transfer is proportional to (f_i + f_opposite) * velocity vector
              // Exerted force is opposite to fluid momentum change
              const momentumEx = outgoingDist + incomingDist;
              dragSum += DX[i] * momentumEx;
              liftSum += DY[i] * momentumEx;
            }
          }
        }
      }
    }

    this.lastDragForce = dragSum;
    this.lastLiftForce = liftSum;

    // Compute reference dimension from obstacle extent
    let obsMinY = Ny, obsMaxY = 0;
    for (let y = 0; y < Ny; y++) {
      for (let x = 0; x < Nx; x++) {
        if (this.obstacle[y * Nx + x] === 1) {
          if (y < obsMinY) obsMinY = y;
          if (y > obsMaxY) obsMaxY = y;
        }
      }
    }
    const refDim = Math.max(obsMaxY - obsMinY, 1);
    const dynPres = 0.5 * 1.0 * u0 * u0;
    if (dynPres > 1e-5) {
      this.lastDragCoeff = dragSum / (dynPres * refDim);
      this.lastLiftCoeff = liftSum / (dynPres * refDim);
    } else {
      this.lastDragCoeff = 0;
      this.lastLiftCoeff = 0;
    }
  }

  /**
   * Helper function to query local interpolated velocity at sub-grid locations.
   */
  public queryVelocity(px: number, py: number): { ux: number; uy: number } {
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, this.Nx - 1);
    const y1 = Math.min(y0 + 1, this.Ny - 1);

    if (x0 < 0 || x0 >= this.Nx || y0 < 0 || y0 >= this.Ny) {
      return { ux: 0, uy: 0 };
    }

    const tx = px - x0;
    const ty = py - y0;

    const c00 = y0 * this.Nx + x0;
    const c10 = y0 * this.Nx + x1;
    const c01 = y1 * this.Nx + x0;
    const c11 = y1 * this.Nx + x1;

    // Bilinear interpolation
    const vx = (1 - tx) * (1 - ty) * this.ux[c00] +
               tx * (1 - ty) * this.ux[c10] +
               (1 - tx) * ty * this.ux[c01] +
               tx * ty * this.ux[c11];

    const vy = (1 - tx) * (1 - ty) * this.uy[c00] +
               tx * (1 - ty) * this.uy[c10] +
               (1 - tx) * ty * this.uy[c01] +
               tx * ty * this.uy[c11];

    return { ux: vx, uy: vy };
  }
}
