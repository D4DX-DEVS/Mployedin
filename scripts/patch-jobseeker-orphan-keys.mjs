/**
 * Idempotent removal of locale keys orphaned by the job-seeker application
 * journey shell work.
 *
 * Each key below was live at commit 88bfeaf0 and has no reference left in
 * `src/` now that the four seeker pages render their title through
 * `jobSeekerJourney.title` and their search box through TableToolbar's own
 * aria-label.
 *
 * Deliberately NOT removed:
 *   - jobSeekerApplications.export.*  — already dead at 88bfeaf0, so it is
 *     not this work's to delete. Reported to the user instead.
 *   - jobSeekerOnboarding.status_* / .docStatus_*  — built at runtime as
 *     t(`status_${x}`); no static reference exists and none should be expected.
 *   - jobSeekerOffers.labels.salary — briefly orphaned by an out-of-scope
 *     card edit that has since been reverted; the label is live again.
 *
 * Another session edits these files concurrently, so this is one atomic
 * read-modify-write per file and it re-verifies that session's keys survive.
 *
 * Usage: node scripts/patch-jobseeker-orphan-keys.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["messages/en.json", "messages/ar.json"];

const ORPHANS = [
  ["jobSeekerApplications", "title"],
  ["jobSeekerApplications", "searchLabel"],
  ["jobSeekerInterviews", "title"],
];

/** Keys owned by the other concurrent session; must survive untouched. */
const MUST_SURVIVE = [
  ["employerApplications", "scoreAllAlreadyScored"],
  ["employerApplications", "scoreAllMissingData"],
  ["employerApplications", "shortlistNoneInView"],
  ["employerApplications", "shortlistAllPastApplied"],
  ["employerApplications", "shortlistNeedsScores"],
];

const checkOnly = process.argv.includes("--check");
let changed = 0;

for (const file of LOCALES) {
  const raw = readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\n$/.test(raw);
  const data = JSON.parse(raw);

  const survivors = MUST_SURVIVE.filter(([ns, key]) =>
    Object.prototype.hasOwnProperty.call(data[ns] ?? {}, key),
  ).length;

  let removed = 0;
  for (const [ns, key] of ORPHANS) {
    if (data[ns] && Object.prototype.hasOwnProperty.call(data[ns], key)) {
      if (!checkOnly) delete data[ns][key];
      removed += 1;
    }
  }

  let out = JSON.stringify(data, null, 2);
  if (eol === "\r\n") out = out.replace(/\n/g, "\r\n");
  if (trailingNewline) out += eol;

  if (!checkOnly && removed > 0) {
    writeFileSync(file, out, "utf8");
    changed += 1;
  }
  console.log(
    `${file}: ${checkOnly ? "would remove" : "removed"} ${removed}/${ORPHANS.length} orphan(s); ` +
      `${survivors}/${MUST_SURVIVE.length} concurrent-session key(s) intact`,
  );
}

console.log(checkOnly ? "check only, nothing written" : `files written: ${changed}`);
