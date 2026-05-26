const MAX_INLET_VELOCITY = 0.15;
const MAX_KMH = 300;

export function inletVelocityToKmh(inletVelocity: number): number {
  return (inletVelocity / MAX_INLET_VELOCITY) * MAX_KMH;
}

export function kmhToInletVelocity(kmh: number): number {
  return (kmh / MAX_KMH) * MAX_INLET_VELOCITY;
}

export function formatKmh(kmh: number): string {
  if (kmh >= 100) return kmh.toFixed(0);
  if (kmh >= 10) return kmh.toFixed(1);
  return kmh.toFixed(2);
}
