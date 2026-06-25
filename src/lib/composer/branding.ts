/**
 * Poster Composer — Branding Rules
 * Mandatory branding elements that appear on every poster.
 * These are NOT configurable by employers.
 */

import type { PosterType } from "./types";

export const MPLOYEDIN_LOGO_PATH = "/mployedin-logo.png";
export const MPLOYEDIN_LOGO_WHITE_PATH = "/mployedin-logo.png"; // white variant for dark backgrounds

export const APPLY_TEXT_TEMPLATE = "Apply via Mployedin";

/**
 * Build the job application URL for QR code generation.
 */
export function buildJobApplyUrl(jobId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com";
  return `${baseUrl}/jobs/${jobId}`;
}

/**
 * Build the poster share URL.
 */
export function buildPosterShareUrl(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com";
  return `${baseUrl}/poster/${slug}`;
}

/**
 * Build the QR tracking redirect URL (for analytics).
 */
export function buildQrTrackingUrl(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com";
  return `${baseUrl}/api/poster/${slug}/qr`;
}

/**
 * Get the headline text based on poster type.
 */
export function getHeadlineForType(type: PosterType): string {
  const headlines: Record<PosterType, string> = {
    "single-job": "WE ARE HIRING!",
    "bulk-hiring": "WE ARE HIRING!",
    "urgent-hiring": "URGENT HIRING!",
    "walk-in-interview": "WALK-IN INTERVIEW",
  };
  return headlines[type];
}

/**
 * Mandatory branding elements on every poster:
 * - Employer logo (from their profile)
 * - Employer company name
 * - QR code pointing to job (via tracking URL for analytics)
 * - "Apply via Mployedin" text
 * - Mployedin logo
 *
 * These cannot be toggled off by the employer.
 */
export const MANDATORY_ELEMENTS = [
  "employerLogo",
  "companyName",
  "headline",
  "jobTitle",
  "qrCode",
  "mployedinLogo",
  "applyText",
] as const;
