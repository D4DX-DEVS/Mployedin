/**
 * Onboarding shows one job and one qualification, but a CV import stores all of
 * them. Saving the form used to replace the whole lists with its single entry,
 * so every other job and degree was erased (2026-09-30: a CV with four jobs and
 * two degrees was left with one of each).
 *
 * These merge the form's entry into the stored list instead: it updates the
 * entry it was filled from (named by `_id`, or found by its content on a
 * re-save), or goes first as a new entry. Everything else is kept as stored.
 */

type Entry = { _id?: unknown } & Record<string, unknown>;

function sameId(entry: Entry, id: unknown): boolean {
  return id != null && entry._id != null && String(entry._id) === String(id);
}

/** Letters and digits of any script: an ASCII-only rule read every Arabic name as "". */
function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Equal and not blank: two names that normalise to nothing are unknown, not the same. */
function sameText(a: unknown, b: unknown): boolean {
  const left = norm(a);
  return left !== "" && left === norm(b);
}

function merge<T extends Entry>(
  stored: T[],
  incoming: Entry,
  sameEntry: (entry: T) => boolean,
  apply: (target: T | undefined, answer: Entry) => T,
): { list: T[]; index: number } {
  const list = [...stored];
  const { _id: id, ...answer } = incoming;
  let index = list.findIndex((entry) => sameId(entry, id));
  if (index === -1) index = list.findIndex(sameEntry);
  if (index === -1) {
    // A client-sent id that matched nothing is never stored: the database
    // assigns ids, and a forged one could collide later.
    list.unshift(apply(undefined, answer));
    return { list, index: 0 };
  }
  list[index] = apply(list[index], answer);
  return { list, index };
}

/**
 * The form asks for the title, company, start and whether it is current. The
 * end date, description and country are kept from the stored job. An end date
 * is dropped when the seeker says the job is current.
 */
export function mergeExperienceEntry<T extends Entry>(stored: T[], incoming: Entry): { list: T[]; index: number } {
  return merge(
    stored,
    incoming,
    (entry) => sameText(entry.company, incoming.company) && sameText(entry.jobTitle, incoming.jobTitle),
    (target, answer) => {
      const defined = Object.fromEntries(Object.entries(answer).filter(([, value]) => value !== undefined));
      const next = { ...(target ?? {}), ...defined } as T;
      if (answer.isCurrent === true) delete (next as Entry).endDate;
      return next;
    },
  );
}

/** Every field the education step asks. Its answers win even when blank. */
const EDUCATION_FORM_FIELDS = ["degree", "institution", "field", "course", "courseType", "startYear", "graduationDate"];

/**
 * The form asks every part of a qualification, so its answers replace them all,
 * blank ones included (a cleared specialisation must clear). Anything the form
 * does not ask, like a grade, is kept.
 */
export function mergeEducationEntry<T extends Entry>(stored: T[], incoming: Entry): { list: T[]; index: number } {
  return merge(
    stored,
    incoming,
    (entry) =>
      // Degree must be a real match; course and institution may both be blank.
      sameText(entry.degree, incoming.degree)
      && norm(entry.course) === norm(incoming.course)
      && norm(entry.institution) === norm(incoming.institution),
    (target, answer) => {
      if (!target) return Object.fromEntries(Object.entries(answer).filter(([, value]) => value !== undefined)) as T;
      const next = { ...target } as Entry;
      for (const field of EDUCATION_FORM_FIELDS) {
        if (answer[field] === undefined) delete next[field];
        else next[field] = answer[field];
      }
      return next as T;
    },
  );
}
