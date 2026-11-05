import mongoose from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { escapeRegex } from "@/lib/security/sanitize";
import { locationSearchRegex } from "@/lib/i18n/locations";

/**
 * Ranked talent search for staff: "a 2-year electrical engineer in Kuwait".
 *
 * The plain list search matches one literal phrase against one field at a
 * time, so a brief like that found nobody even with 165 electrical profiles
 * on file. Here the role is split into word stems that must all appear across
 * the candidate's titles, skills and education, then everyone who qualifies
 * is scored on title fit, location, experience and CV, best first.
 */

export interface TalentSearchArgs {
  /** Job title or profession, e.g. "electrical engineer". */
  role?: string;
  skills?: string[];
  /** Country or city the candidate is in, has worked in, or prefers. */
  location?: string;
  nationality?: string;
  minYears?: number;
  maxYears?: number;
  hasCV?: boolean;
  limit?: number;
}

export type LocationFit = "current" | "worked" | "prefers";
export type ExperienceFit = "meets" | "below" | "above" | "unknown";

export interface TalentMatch {
  seekerId: string;
  name: string;
  /** The title that matched the role best, else the headline. */
  title?: string;
  location?: string;
  nationality?: string;
  experienceYears?: number;
  skills: string[];
  hasCV: boolean;
  profileCompleteness?: number;
  availability?: string;
  /** 0–100: share of the points this brief could award. */
  fit: number;
  locationFit?: LocationFit;
  experienceFit?: ExperienceFit;
  matchedSkills: string[];
}

export interface TalentSearchResult {
  candidates: TalentMatch[];
  /** Everyone who met the role, before the limit. */
  totalMatched: number;
  /** True when nobody had every role word, so any one word was accepted. */
  relaxed: boolean;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "at", "for", "with", "to", "who", "best", "top", "good",
  "year", "years", "yr", "yrs", "experience", "experienced", "candidate", "candidates", "jobseeker", "jobseekers",
  "seeker", "seekers", "senior", "junior", "need", "want", "find", "get", "me", "some", "people",
]);

/** Word stem as a regex source: "electrical" → "electri", "engineer" → "engin". */
function stemPattern(word: string): string {
  if (word.length <= 3) return `\\b${escapeRegex(word)}\\b`;
  return escapeRegex(word.slice(0, Math.max(4, word.length - 3)));
}

export function roleStems(role: string | undefined): RegExp[] {
  if (!role) return [];
  const words = role.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 6).map((w) => new RegExp(stemPattern(w), "i"));
}

interface SeekerDoc {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  fullName?: string;
  headline?: string;
  skills?: string[];
  experience?: Array<{ jobTitle?: string; company?: string; location?: string }>;
  education?: Array<{ degree?: string; field?: string }>;
  currentLocation?: string;
  preferredLocations?: string[];
  nationality?: string;
  totalExperienceYears?: number;
  cv?: { originalUrl?: string };
  profileCompleteness?: number;
  availabilityStatus?: string;
}

/** Most profiles are scored in memory; this many is plenty for one brief. */
const POOL_LIMIT = 1500;

const hit = (re: RegExp, values: Array<string | undefined>) => values.some((v) => typeof v === "string" && re.test(v));

function experienceFit(years: number | undefined, hasHistory: boolean, min?: number, max?: number): ExperienceFit | undefined {
  if (min == null && max == null) return undefined;
  // 0 with a work history means "not stated", not "no experience".
  if (years == null || (years === 0 && hasHistory)) return "unknown";
  if (min != null && years < min) return "below";
  if (max != null && years > max) return "above";
  return "meets";
}

function scoreSeeker(doc: SeekerDoc, stems: RegExp[], args: TalentSearchArgs, locRe: RegExp | null, skillRes: RegExp[]) {
  const titles = [doc.headline, ...(doc.experience ?? []).map((e) => e.jobTitle)].filter((t): t is string => Boolean(t));
  const other = [
    ...(doc.skills ?? []),
    ...(doc.education ?? []).flatMap((e) => [e.degree, e.field]),
  ].filter((t): t is string => Boolean(t));

  let score = 0;
  let max = 0;
  let title: string | undefined;
  let roleWords = 0;

  if (stems.length) {
    max += 60;
    // A single title carrying every role word is the strongest signal.
    title = titles.find((t) => stems.every((re) => re.test(t)));
    if (title) {
      score += 60;
      roleWords = stems.length;
    } else {
      for (const re of stems) {
        if (hit(re, titles)) { score += 40 / stems.length; roleWords++; }
        else if (hit(re, other)) { score += 20 / stems.length; roleWords++; }
      }
      title = titles.find((t) => stems.some((re) => re.test(t)));
    }
  }

  const matchedSkills = skillRes.length ? (doc.skills ?? []).filter((s) => skillRes.some((re) => re.test(s))) : [];
  if (skillRes.length) {
    max += 20;
    score += (20 * Math.min(matchedSkills.length, skillRes.length)) / skillRes.length;
  }

  let locationFit: LocationFit | undefined;
  if (locRe) {
    max += 25;
    const jobPlaces = (doc.experience ?? []).flatMap((e) => [e.location, e.company, e.jobTitle]);
    if (hit(locRe, [doc.currentLocation])) { locationFit = "current"; score += 25; }
    else if (hit(locRe, jobPlaces)) { locationFit = "worked"; score += 18; }
    else if (hit(locRe, doc.preferredLocations ?? [])) { locationFit = "prefers"; score += 12; }
  }

  const expFit = experienceFit(doc.totalExperienceYears, (doc.experience ?? []).length > 0, args.minYears, args.maxYears);
  if (expFit) {
    max += 15;
    // "2 years experienced" means about two, not "two or more": with no cap
    // given, the points fade once someone is well past the asked level.
    const over = args.maxYears == null && args.minYears != null ? (doc.totalExperienceYears ?? 0) - (args.minYears + 3) : 0;
    score += expFit === "meets" ? Math.max(8, 15 - Math.max(0, over)) : expFit === "unknown" ? 5 : expFit === "above" ? 8 : 0;
  }

  // Tie-breakers every brief gets: a CV to send and a complete profile.
  const hasCV = Boolean(doc.cv?.originalUrl);
  max += 10;
  score += (hasCV ? 6 : 0) + Math.min(4, (doc.profileCompleteness ?? 0) / 25);

  return {
    roleWords,
    match: {
      seekerId: String(doc._id),
      name: doc.fullName || "Candidate",
      title: title ?? doc.headline,
      location: doc.currentLocation,
      nationality: doc.nationality,
      experienceYears: doc.totalExperienceYears,
      skills: (doc.skills ?? []).slice(0, 6),
      hasCV,
      profileCompleteness: doc.profileCompleteness,
      availability: doc.availabilityStatus,
      fit: max ? Math.round((score / max) * 100) : 0,
      locationFit,
      experienceFit: expFit,
      matchedSkills: matchedSkills.slice(0, 6),
    } satisfies TalentMatch,
  };
}

/**
 * Rank job seekers for a brief. `scope` narrows the pool for callers who may
 * not see every seeker; admins pass none.
 */
export async function searchTalent(args: TalentSearchArgs, scope?: Record<string, unknown>): Promise<TalentSearchResult> {
  const stems = roleStems(args.role);
  const skillRes = (args.skills ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 10).map((s) => new RegExp(escapeRegex(s), "i"));
  const locRe = args.location?.trim() ? new RegExp(locationSearchRegex(args.location), "i") : null;
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

  const conditions: Record<string, unknown>[] = [{ roleArchivedAt: null }];
  if (scope) conditions.push(scope);
  if (args.hasCV) conditions.push({ "cv.originalUrl": { $exists: true, $ne: "" } });
  if (args.nationality?.trim()) conditions.push({ nationality: { $regex: escapeRegex(args.nationality.trim()), $options: "i" } });
  // Any role word or skill gets a profile into the pool; scoring decides the rest.
  const anyOf = [...stems, ...skillRes];
  if (anyOf.length) {
    conditions.push({
      $or: anyOf.flatMap((re) => [
        { headline: re }, { "experience.jobTitle": re }, { skills: re },
        { "education.field": re }, { "education.degree": re },
      ]),
    });
  } else if (locRe) {
    conditions.push({ $or: [{ currentLocation: locRe }, { preferredLocations: locRe }, { "experience.location": locRe }] });
  }

  const docs = await JobSeeker.find({ $and: conditions })
    .select("userId fullName headline skills experience.jobTitle experience.company experience.location education.degree education.field currentLocation preferredLocations nationality totalExperienceYears cv.originalUrl profileCompleteness availabilityStatus")
    .sort({ profileCompleteness: -1 })
    .limit(POOL_LIMIT)
    .lean<SeekerDoc[]>();

  // Deactivated or deleted accounts are not candidates anyone can contact.
  const inactive = new Set(
    (await User.find({ _id: { $in: docs.map((d) => d.userId).filter(Boolean) }, isActive: false }).select("_id").lean())
      .map((u) => String(u._id)),
  );
  const scored = docs
    .filter((d) => !inactive.has(String(d.userId)))
    .map((d) => scoreSeeker(d, stems, args, locRe, skillRes));

  let pool = stems.length ? scored.filter((s) => s.roleWords === stems.length) : scored;
  let relaxed = false;
  if (!pool.length && stems.length > 1) {
    pool = scored.filter((s) => s.roleWords > 0);
    relaxed = pool.length > 0;
  }

  const ranked = pool
    .map((s) => s.match)
    .sort((a, b) => b.fit - a.fit || Number(b.hasCV) - Number(a.hasCV) || (b.profileCompleteness ?? 0) - (a.profileCompleteness ?? 0));
  return { candidates: ranked.slice(0, limit), totalMatched: ranked.length, relaxed };
}
