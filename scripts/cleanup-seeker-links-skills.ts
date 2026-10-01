/**
 * Clean stored seeker links and skills that the profile save rejects.
 *
 * Seeker pages send the stored profile back to PATCH /api/job-seeker/profile,
 * so one stored value the validator rejects fails every save — "We couldn't
 * save" in the CV builder (client report, 2026-10-01). Two shapes did:
 *  - socialLinks whose url is a link's visible text ("LinkedIn"), or a LinkedIn
 *    address in a form other than https://www.linkedin.com/in/<name> — the CV
 *    reader stored them as read;
 *  - skills where the 2026-06-02 bulk import joined a whole list into one
 *    entry over 100 characters.
 * The pages now clean both on load (cleanSocialLinks, cleanSkills). This writes
 * the same cleaning back, so the stored profile and what employers see match.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/cleanup-seeker-links-skills.ts      # dry run
 *   ... --apply --backup <file.json>   write; first saves every changed profile's old values to <file>
 *   ... --restore <file.json> [--apply]  put the values from a backup back (dry run without --apply)
 *
 * Only a field the validator rejects is rewritten, and only on the profiles
 * where it fails. Each write is matched on the updatedAt that was read, so a
 * seeker who saves in between is skipped, not overwritten. updatedAt is left
 * alone (this is not a seeker edit); profileCompleteness is recomputed,
 * because a junk "LinkedIn" entry counted as a LinkedIn link. Idempotent: a
 * second run finds nothing.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import mongoose from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import { cleanSocialLinks, toProfileLinkUrl } from "@/lib/jobSeeker/socialLinks";
import { cleanSkills } from "@/lib/jobSeeker/tagList";
import { profileCompletenessScore, type ProfileCompletenessInput } from "@/lib/jobSeeker/profileCompleteness";

const args = process.argv.slice(2);
const argValue = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const APPLY = args.includes("--apply");
const BACKUP = argValue("--backup");
const RESTORE = argValue("--restore");

const out = (line: string) => process.stdout.write(`${line}\n`);

interface Link { label?: string; url?: string }
interface StoredSeeker extends ProfileCompletenessInput {
  _id: mongoose.Types.ObjectId;
  socialLinks?: Link[];
  skills?: string[];
  profileCompleteness?: number;
  updatedAt?: Date;
}
interface BackupRow {
  _id: string;
  socialLinks?: Link[];
  skills?: string[];
  profileCompleteness?: number;
  updatedAt?: string;
}

const linksRule = jobSeekerProfileUpdateSchema.shape.socialLinks;
const skillsRule = jobSeekerProfileUpdateSchema.shape.skills;
const plainLinks = (links: Link[] | undefined) => (links ?? []).map((l) => ({ label: l.label, url: l.url }));

/** What to write for one seeker, or null when the profile save already accepts it. */
function planFor(seeker: StoredSeeker) {
  const set: { socialLinks?: Link[]; skills?: string[]; profileCompleteness?: number } = {};
  const notes: string[] = [];

  if (!linksRule.safeParse(plainLinks(seeker.socialLinks)).success) {
    const cleaned = cleanSocialLinks(seeker.socialLinks);
    const dropped = (seeker.socialLinks ?? []).filter((l) => !toProfileLinkUrl(l.label ?? "", l.url));
    set.socialLinks = cleaned;
    notes.push(`links ${seeker.socialLinks?.length ?? 0}→${cleaned.length}` +
      (dropped.length ? ` (dropped ${dropped.map((l) => `${l.label}=${JSON.stringify(String(l.url).slice(0, 40))}`).join(", ")})` : " (rewritten)"));
  }

  if (!skillsRule.safeParse(seeker.skills ?? []).success) {
    const cleaned = cleanSkills(seeker.skills);
    const joined = (seeker.skills ?? []).filter((s) => s.length > 100).length;
    set.skills = cleaned;
    notes.push(`skills ${seeker.skills?.length ?? 0}→${cleaned.length} (split ${joined} joined entr${joined === 1 ? "y" : "ies"})`);
  }

  if (!set.socialLinks && !set.skills) return null;
  const score = profileCompletenessScore({ ...seeker, ...set });
  if (score !== seeker.profileCompleteness) {
    set.profileCompleteness = score;
    notes.push(`completeness ${seeker.profileCompleteness ?? "-"}→${score}`);
  }
  return { set, notes };
}

async function cleanup() {
  const seekers = await JobSeeker.find({})
    .select("userId nationality currentLocation summary headline skills experience education languages linkedin socialLinks profileCompleteness updatedAt")
    .lean<StoredSeeker[]>();

  const plans = seekers.flatMap((s) => {
    const plan = planFor(s);
    return plan ? [{ seeker: s, ...plan }] : [];
  });

  out(`${seekers.length} seekers checked, ${plans.length} would fail a profile save and need cleaning.`);
  for (const { seeker, notes } of plans) out(`  ${seeker._id}  ${notes.join("; ")}`);

  if (!APPLY) {
    out(plans.length ? "\nDry run — nothing written. Re-run with --apply --backup <file.json>." : "\nNothing to do.");
    return;
  }
  if (!plans.length) return;
  if (!BACKUP) throw new Error("--apply needs --backup <file.json> so the change can be undone");
  if (existsSync(BACKUP)) throw new Error(`${BACKUP} already exists — choose a new backup file`);

  const backup: BackupRow[] = plans.map(({ seeker }) => ({
    _id: String(seeker._id),
    socialLinks: plainLinks(seeker.socialLinks),
    skills: seeker.skills ?? [],
    profileCompleteness: seeker.profileCompleteness,
    updatedAt: seeker.updatedAt?.toISOString(),
  }));
  writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
  out(`\nBackup of ${backup.length} profiles written to ${BACKUP}`);

  let written = 0;
  let skipped = 0;
  for (const { seeker, set } of plans) {
    const unchangedSinceRead = seeker.updatedAt ? { updatedAt: seeker.updatedAt } : {};
    const res = await JobSeeker.updateOne(
      { _id: seeker._id, ...unchangedSinceRead },
      { $set: set },
      { timestamps: false, runValidators: true },
    );
    if (res.matchedCount === 1) written++;
    else {
      skipped++;
      out(`  skipped ${seeker._id}: changed since it was read`);
    }
  }
  out(`Cleaned ${written} profiles${skipped ? `, skipped ${skipped}` : ""}.`);
}

async function restore(file: string) {
  const rows = JSON.parse(readFileSync(file, "utf8")) as BackupRow[];
  out(`Restoring ${rows.length} profiles from ${file}${APPLY ? "" : " (dry run — add --apply to write)"}`);
  if (!APPLY) return;
  let restored = 0;
  for (const row of rows) {
    const res = await JobSeeker.updateOne(
      { _id: new mongoose.Types.ObjectId(row._id) },
      { $set: { socialLinks: row.socialLinks ?? [], skills: row.skills ?? [], profileCompleteness: row.profileCompleteness } },
      { timestamps: false },
    );
    restored += res.matchedCount;
  }
  out(`Restored ${restored} profiles.`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Run with --env-file=.env");
  await mongoose.connect(uri);
  if (RESTORE) await restore(RESTORE);
  else await cleanup();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
