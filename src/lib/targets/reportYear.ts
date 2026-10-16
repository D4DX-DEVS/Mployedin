/**
 * The year a target report opens on when nobody asked for one. The current year
 * when it has targets; otherwise the nearest year that does, the later one on a
 * tie. Opening on a year with nothing in it made targets set for next year look
 * like they had never been created.
 */
export function defaultReportYear(yearsWithTargets: number[], currentYear: number): number {
  if (yearsWithTargets.length === 0 || yearsWithTargets.includes(currentYear)) return currentYear;
  return [...yearsWithTargets].sort(
    (left, right) => Math.abs(left - currentYear) - Math.abs(right - currentYear) || right - left,
  )[0];
}
