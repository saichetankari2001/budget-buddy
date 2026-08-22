export function computeCountUpValue(elapsedMs: number, durationMs: number, target: number): number {
  if (elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;

  const progress = elapsedMs / durationMs;
  const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
  return target * eased;
}
