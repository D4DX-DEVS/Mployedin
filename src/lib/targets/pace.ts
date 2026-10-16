/**
 * A profile's pace against the year so far — the same `riskScore` the target
 * report computes: behind when more than 10 points under the expected share.
 */
export type TargetPace = "behind" | "onPace" | "achieved";

export function targetPace(profile: { profitProgress: number; riskScore: "high" | "medium" | "low" }): TargetPace {
  if (profile.profitProgress >= 100) return "achieved";
  return profile.riskScore === "low" ? "onPace" : "behind";
}
