/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ObstacleType = 
  | 'naca0012' 
  | 'naca2412' 
  | 'naca4412' 
  | 'circle' 
  | 'flat_plate' 
  | 'car' 
  | 'train' 
  | 'custom' 
  | 'uploaded';

export type ColoringType = 'velocity' | 'pressure' | 'vorticity';

export interface NacaParams {
  m: number; // Max camber (0.0 to 0.09)
  p: number; // Camber position (0.0 to 0.9)
  t: number; // Thickness (0.05 to 0.40)
}

export interface SimulationParams {
  obstacleType: ObstacleType;
  inletVelocity: number; // 0.01 to 0.15 (in LBM lattice units)
  viscosity: number;     // 0.005 to 0.20
  angleIndex: number;    // slider value for Angle of Attack (deg)
  stepsPerFrame: number; // 1 to 25 steps per animation frame for stability/speed
  obstacleScale: number; // 0.5 to 2.0
  nacaParams: NacaParams;
}

export interface VisualOptions {
  showSmoke: boolean;
  showStreamlines: boolean;
  showVectors: boolean;
  showSlice: boolean;
  showSurfaceColor: boolean;
  showGround: boolean;
  sliceZ: number; // Z-coordinate of slice (-1 to 1)
  coloring: ColoringType;
  particleCount: number;
  particleSize: number; // 0.5 to 5.0
}

export interface AeroMetrics {
  liftForce: number;
  dragForce: number;
  liftCoeff: number;
  dragCoeff: number;
  liftToDragRatio: number;
  reynoldsNumber: number;
  strouhalNumber: number;
  fps: number;
}

export interface Point2D {
  x: number;
  y: number;
}
