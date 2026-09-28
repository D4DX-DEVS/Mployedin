/** Applications by status, every enum value present (0 when none). Client-safe: no models. */
export type StatusBreakdown = Record<
  "applied" | "shortlisted" | "interview_scheduled" | "selected" | "offer" | "hired" | "rejected" | "withdrawn",
  number
>;

export const EMPTY_STATUS_BREAKDOWN: StatusBreakdown = {
  applied: 0,
  shortlisted: 0,
  interview_scheduled: 0,
  selected: 0,
  offer: 0,
  hired: 0,
  rejected: 0,
  withdrawn: 0,
};
