/** Percent of target reached, or null when no target is set. No server imports: client pages use it. */
export function achievement(actual: number, target: number): number | null {
  if (!(target > 0)) return null;
  return Math.round((actual / target) * 100);
}
