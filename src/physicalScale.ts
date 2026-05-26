const MODEL_3_LENGTH_M = 4.694;
const MODEL_CELLS_BASE = 26;
const CS_AIR = 343; // speed of sound in air, m/s at 20°C

export function inletVelocityToKmh(inletVelocity: number, nx: number): number {
  const modelCells = MODEL_CELLS_BASE * (nx / 120);
  const dx = MODEL_3_LENGTH_M / modelCells;
  const dt = dx / (CS_AIR * Math.sqrt(3));
  return (inletVelocity * dx / dt) * 3.6;
}

export function formatKmh(kmh: number): string {
  if (kmh >= 100) return kmh.toFixed(0);
  if (kmh >= 10) return kmh.toFixed(1);
  return kmh.toFixed(2);
}
