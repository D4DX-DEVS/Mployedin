/** The dashboard's own pace (`targetPace`): achieved, on pace, or behind. */
export type Pace = "achieved" | "onPace" | "behind";

/* Status never by colour alone: each chip carries its word. */
export const PACE_CHIP: Record<Pace, string> = {
  achieved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  onPace: "border-sky-200 bg-sky-50 text-sky-700",
  behind: "border-rose-200 bg-rose-50 text-rose-700",
};

export const PACE_LABEL_KEYS: Record<Pace, string> = {
  achieved: "paceAchieved",
  onPace: "paceOnPace",
  behind: "paceBehind",
};
