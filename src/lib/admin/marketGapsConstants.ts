/** Shared by the Market gaps page and its API. No server imports: client components read this. */
export const GAP_KINDS = ["find_employers", "thin_supply", "find_seekers", "fix_data"] as const;
export const GAP_STATUS_FILTERS = ["open", "new", "assigned", "done", "dismissed", "resolved", "all"] as const;
export const GAP_PRIORITIES = ["high", "medium", "low"] as const;
export const GAP_SORTS = ["seekers", "wait", "priority", "recent"] as const;
