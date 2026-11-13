/**
 * The text a shared job carries into WhatsApp / X / a pasted message.
 *
 * It used to be the bare title plus the link ("Pharmacist https://…"), which
 * the client said needed editing every time (rollout row "Job sharing").
 * Lines arrive already translated so the message follows the sharer's locale.
 */
export interface JobShareLines {
  /** e.g. "We're hiring: Pharmacist" */
  headline: string;
  company?: string;
  location?: string;
  salary?: string;
  type?: string;
  skills?: string;
  /** e.g. "Apply here: https://…" */
  apply: string;
}

export function buildJobShareMessage(lines: JobShareLines): string {
  const details = [lines.company, lines.location, lines.salary, lines.type, lines.skills]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return [lines.headline.trim(), ...details, "", lines.apply.trim()].join("\n");
}

export interface ShareSalary {
  min?: number;
  max?: number;
  currency?: string;
  isNegotiable?: boolean;
}

/**
 * "QAR 9,000", "AED 4,000 – 6,000", or undefined when there is no figure.
 * Negotiable pay keeps its figure; the caller adds the "negotiable" word.
 */
export function shareSalaryFigure(salary: ShareSalary | undefined, locale: string): string | undefined {
  if (!salary) return undefined;
  const min = Number(salary.min ?? 0);
  const max = Number(salary.max ?? 0);
  if (min <= 0 && max <= 0) return undefined;
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  const currency = (salary.currency ?? "").trim();
  const range = min > 0 && max > 0 && min !== max ? `${fmt(min)} – ${fmt(max)}` : fmt(Math.max(min, max));
  return currency ? `${currency} ${range}` : range;
}
