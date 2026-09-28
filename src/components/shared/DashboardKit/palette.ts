/**
 * Chart palette shared by every dashboard.
 *
 * Categorical slots are assigned in this fixed order and never cycled.
 * Validated with the dataviz skill's validate_palette.js (light surface):
 * adjacent CVD ΔE ≥ 9, normal-vision ΔE ≥ 22; aqua and yellow sit under 3:1
 * against white, so charts that use them always carry direct labels or a list.
 */
export const SERIES = ["#0242CE", "#eb6834", "#1baf7a", "#eda100", "#4a3aa7", "#e34948"] as const;

/** Reserved status colours — never reused as a series colour. */
export const STATUS_COLOR = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Sequential blue ramp (light → dark) for ordinal stages such as a funnel. */
export const BLUE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"] as const;

export const GRID_STROKE = "hsl(var(--border) / 0.7)";
export const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;
