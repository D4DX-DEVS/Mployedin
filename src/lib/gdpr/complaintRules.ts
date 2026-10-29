/** Client-safe limits for privacy complaints (lib/gdpr/privacyComplaint.ts creates them). */

/** Longest complaint we take in one go (GdprRequest.notes holds 2000). */
export const COMPLAINT_MAX = 2000;
/** Shortest: a few words saying what is wrong. */
export const COMPLAINT_MIN = 10;
/** DUAA 2025: a complaint is acknowledged within 30 days of receipt. */
export const COMPLAINT_ACK_DAYS = 30;
