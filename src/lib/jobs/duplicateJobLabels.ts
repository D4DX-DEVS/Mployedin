export interface JobLike {
  _id: string;
  title: string;
  createdAt?: string;
}

export interface JobFilterOption {
  value: string;
  label: string;
}

/** Case/space-insensitive key so "UI/UX Designer", "ui/ux  designer" and a trailing-space
 *  variant all count as the same posting title. */
const normalizeTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Build the "All Jobs" filter dropdown options. Postings whose title collides are
 * disambiguated: the newest is tagged with `latestLabel`, the others show their posting
 * date — plus the time when posted on the same calendar day. Unique titles stay clean.
 */
export function buildJobFilterOptions(
  jobs: JobLike[],
  opts: { allLabel: string; latestLabel: string; dateLocale?: string },
): JobFilterOption[] {
  const { allLabel, latestLabel, dateLocale = "en-US" } = opts;

  const groups = jobs.reduce<Record<string, JobLike[]>>((acc, j) => {
    (acc[normalizeTitle(j.title)] ??= []).push(j);
    return acc;
  }, {});

  const labelFor = (j: JobLike): string => {
    const group = groups[normalizeTitle(j.title)] ?? [j];
    if (group.length < 2) return j.title; // unique name — no suffix needed

    const newest = group.reduce((a, b) =>
      new Date(b.createdAt ?? 0) > new Date(a.createdAt ?? 0) ? b : a
    );

    let stamp = "";
    if (j.createdAt) {
      const day = new Date(j.createdAt).toLocaleDateString(dateLocale);
      const sameDay = group.filter(
        (g) => g.createdAt && new Date(g.createdAt).toLocaleDateString(dateLocale) === day
      ).length > 1;
      stamp = sameDay
        ? new Date(j.createdAt).toLocaleString(dateLocale, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : day;
    }

    return [j.title, stamp, j._id === newest._id ? latestLabel : ""].filter(Boolean).join(" · ");
  };

  return [{ value: "", label: allLabel }, ...jobs.map((j) => ({ value: j._id, label: labelFor(j) }))];
}
