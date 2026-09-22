/** Badge classes for a 1–5 scorecard rating. */
export function getScoreBadgeColor(score: number) {
  if (score >= 4.5) return "bg-emerald-100 text-emerald-700";
  if (score >= 3.5) return "bg-green-100 text-green-700";
  if (score >= 2.5) return "bg-amber-100 text-amber-700";
  if (score >= 1.5) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}
