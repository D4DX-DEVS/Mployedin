/**
 * How long a job seeker has worked, from what they state or their dated jobs.
 *
 * Lives apart from the CV prefill helpers so list pages (the agent's
 * candidates table) can use it without pulling the phone-number library in.
 */

/** The form's experience-years list stops here. */
const MAX_FORM_YEARS = 30;
/** A stated total above this is a misreading (cv parsing drops it the same way). */
const MAX_STATED_YEARS = 60;

/** A job's dates, however they arrived: a stored profile or the raw reading. */
export interface DatedJob {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean;
}

/**
 * A month as a single number. Stored dates are UTC; "2025-03" and ISO strings
 * are read by their digits; anything else ("Jan 2019") is parsed as local time
 * and read back in local time — reading its UTC parts put it in December 2018
 * for anyone east of UTC.
 */
export function monthIndex(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getUTCFullYear() * 12 + value.getUTCMonth();
  }
  const iso = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
  if (iso) return Number(iso[1]) * 12 + (iso[2] ? Number(iso[2]) - 1 : 0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear() * 12 + date.getMonth();
}

/**
 * Total experience for the form's years/months selects.
 *
 * The figure the CV states ("6+ years of experience") comes first: it is what
 * the seeker claims, and a CV often leaves older jobs undated. Without one, the
 * dated jobs are added up with overlaps counted once. A past job's last month
 * counts ("Jan – Dec 2020" is a year); a past job with no end date has no
 * length and is skipped rather than guessed.
 */
export function totalExperience(
  statedYears: number | null | undefined,
  jobs: DatedJob[],
  now: Date = new Date(),
): { years: number; months: number } | null {
  const stated = Number(statedYears);
  let months: number;
  if (Number.isFinite(stated) && stated > 0 && stated <= MAX_STATED_YEARS) {
    months = Math.round(stated * 12);
  } else {
    const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const spans = jobs
      .map((job) => {
        const start = monthIndex(job.startDate);
        const ended = monthIndex(job.endDate);
        const end = job.isCurrent ? nowIndex : ended === null ? null : ended + 1;
        return start !== null && end !== null && end > start ? [start, end] as const : null;
      })
      .filter((span): span is readonly [number, number] => span !== null)
      .sort((a, b) => a[0] - b[0]);
    months = 0;
    let reachedTo = -Infinity;
    for (const [start, end] of spans) {
      if (end <= reachedTo) continue;
      months += end - Math.max(start, reachedTo);
      reachedTo = end;
    }
  }
  if (months <= 0) return null;
  if (months >= MAX_FORM_YEARS * 12) return { years: MAX_FORM_YEARS, months: 0 };
  return { years: Math.floor(months / 12), months: months % 12 };
}
