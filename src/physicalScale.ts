const MODEL_3_LENGTH_METERS = 4.694;
const MODEL_REFERENCE_LENGTH_CELLS_AT_NX_120 = 26;
const NOMINAL_RENDER_FPS = 60;
const FLOW_ADVECTION_SCALE = 32.5;

export function model3MetersPerGridCell(nx: number): number {
  return MODEL_3_LENGTH_METERS / (MODEL_REFERENCE_LENGTH_CELLS_AT_NX_120 * (nx / 120));
}

export function inletVelocityToKmh(inletVelocity: number, nx: number): number {
  if (inletVelocity <= 0) return 0;
  const metersPerFrame = inletVelocity * FLOW_ADVECTION_SCALE * model3MetersPerGridCell(nx);
  return metersPerFrame * NOMINAL_RENDER_FPS * 3.6;
}

export function formatKmh(kmh: number): string {
  if (kmh >= 100) return kmh.toFixed(0);
  if (kmh >= 10) return kmh.toFixed(1);
  return kmh.toFixed(2);
}
