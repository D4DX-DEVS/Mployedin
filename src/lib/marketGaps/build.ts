/**
 * Loads seekers and open jobs, runs `computeGaps`, and stores the result as
 * MarketSuggestion rows (status kept across runs) plus one MarketGapSnapshot.
 *
 * Run nightly by /api/cron/market-gaps and on demand from the admin page. The
 * admin page reads what this stores; it never aggregates seekers live.
 */
import mongoose from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import City from "@/models/City";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import MarketSuggestion, { type IMarketSuggestionHistory } from "@/models/MarketSuggestion";
import MarketGapSnapshot from "@/models/MarketGapSnapshot";
import { computeGaps, DEFAULT_GAP_OPTIONS, type GapDraft, type GapJob, type GapSeeker } from "./compute";

const SEEKER_FRESH_DAYS = 180;
const TREND_KEEP = 8;
/** A done suggestion comes back when its gap grew by this much. */
const REOPEN_GROWTH = 1.25;

interface SeekerDoc {
  _id: mongoose.Types.ObjectId;
  regionCityId?: mongoose.Types.ObjectId | null;
  preferredRoles?: string[];
  skills?: string[];
  createdAt: Date;
}

async function loadSeekers(now: Date): Promise<GapSeeker[]> {
  const since = new Date(now.getTime() - SEEKER_FRESH_DAYS * 24 * 3600 * 1000);
  const docs = await JobSeeker.aggregate<SeekerDoc>([
    { $match: { profileVisibility: { $ne: "hidden" }, roleArchivedAt: null, updatedAt: { $gte: since } } },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u", pipeline: [{ $project: { isActive: 1 } }] } },
    { $match: { "u.isActive": { $ne: false } } },
    { $project: { regionCityId: 1, preferredRoles: 1, skills: 1, createdAt: 1 } },
  ]);
  return docs.map((d) => ({
    id: String(d._id),
    areaId: d.regionCityId ? String(d.regionCityId) : null,
    roles: (d.preferredRoles ?? []).filter(Boolean),
    skills: d.skills ?? [],
    createdAt: d.createdAt ?? now,
  }));
}

async function loadJobs(): Promise<GapJob[]> {
  const jobs = await Job.find({ status: "active" })
    .select("title employerId location.isRemote createdAt")
    .lean<{ _id: mongoose.Types.ObjectId; title: string; employerId?: mongoose.Types.ObjectId; location?: { isRemote?: boolean }; createdAt: Date }[]>();
  const employerIds = [...new Set(jobs.map((j) => String(j.employerId ?? "")).filter(Boolean))];
  const employers = await Employer.find({ _id: { $in: employerIds } })
    .select("regionCityId")
    .lean<{ _id: mongoose.Types.ObjectId; regionCityId?: mongoose.Types.ObjectId | null }[]>();
  const areaOf = new Map(employers.map((e) => [String(e._id), e.regionCityId ? String(e.regionCityId) : null]));
  return jobs.map((j) => ({
    id: String(j._id),
    areaId: j.employerId ? (areaOf.get(String(j.employerId)) ?? null) : null,
    remote: Boolean(j.location?.isRemote),
    title: j.title,
    createdAt: j.createdAt,
  }));
}

/** City id → who holds it as territory. */
async function loadTerritoryOwners(cityIds: string[]) {
  const [cities, sas] = await Promise.all([
    City.find({ _id: { $in: cityIds } }).select("name").lean<{ _id: mongoose.Types.ObjectId; name: string }[]>(),
    SuperAgent.find({ assignedCityIds: { $in: cityIds }, roleArchivedAt: null })
      .select("userId assignedCityIds")
      .lean<{ userId: mongoose.Types.ObjectId; assignedCityIds: mongoose.Types.ObjectId[] }[]>(),
  ]);
  const users = await User.find({ _id: { $in: sas.map((s) => s.userId) } })
    .select("name")
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>();
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const owner = new Map<string, { id: string; name: string }>();
  for (const sa of sas) {
    for (const c of sa.assignedCityIds) {
      if (!owner.has(String(c))) owner.set(String(c), { id: String(sa.userId), name: userName.get(String(sa.userId)) ?? "" });
    }
  }
  return { cityName: new Map(cities.map((c) => [String(c._id), c.name])), owner };
}

export interface BuildResult {
  suggestions: number;
  reopened: number;
  resolved: number;
  seekersConsidered: number;
  durationMs: number;
}

export async function buildMarketGaps(trigger: "cron" | "manual", now: Date = new Date()): Promise<BuildResult> {
  const started = Date.now();
  const [seekers, jobs] = await Promise.all([loadSeekers(now), loadJobs()]);
  const result = computeGaps(seekers, jobs, { ...DEFAULT_GAP_OPTIONS, now });

  const cityIds = [...new Set(result.suggestions.map((s) => s.areaId).filter((x): x is string => Boolean(x)))];
  const { cityName, owner } = await loadTerritoryOwners(cityIds);

  const existing = await MarketSuggestion.find({}).lean();
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const seen = new Set<string>();
  let reopened = 0;

  const ops = result.suggestions.map((s: GapDraft) => {
    seen.add(s.key);
    const prev = byKey.get(s.key);
    const sa = s.areaId ? owner.get(s.areaId) : undefined;
    const trend = [...(prev?.trend ?? []), { at: now, seekers: s.seekers, jobs: s.jobs }].slice(-TREND_KEEP);
    let status = prev?.status ?? "new";
    const history = [...(prev?.history ?? [])];
    if (prev && (prev.status === "resolved" || (prev.status === "done" && s.seekers >= prev.seekers * REOPEN_GROWTH))) {
      status = "new";
      history.push({ at: now, action: "reopened" });
      reopened += 1;
    }
    return {
      updateOne: {
        filter: { key: s.key },
        update: {
          $set: {
            kind: s.kind,
            areaId: s.areaId ? new mongoose.Types.ObjectId(s.areaId) : null,
            areaName: s.areaId ? (cityName.get(s.areaId) ?? "") : "",
            saUserId: sa ? new mongoose.Types.ObjectId(sa.id) : null,
            saName: sa?.name ?? "",
            roleKey: s.roleKey,
            role: s.role,
            seekers: s.seekers,
            jobs: s.jobs,
            priority: s.priority,
            topSkills: s.topSkills,
            medianWaitDays: s.medianWaitDays,
            sampleSeekerIds: s.sampleSeekerIds.map((id) => new mongoose.Types.ObjectId(id)),
            trend,
            status,
            history,
            lastSeenAt: now,
          },
          $setOnInsert: { firstSeenAt: now },
        },
        upsert: true,
      },
    };
  });

  // An open suggestion whose gap has closed is resolved, not left to go stale.
  const gone = existing.filter((e) => !seen.has(e.key) && (e.status === "new" || e.status === "assigned"));
  if (ops.length > 0) await MarketSuggestion.bulkWrite(ops);
  if (gone.length > 0) {
    await MarketSuggestion.updateMany(
      { key: { $in: gone.map((e) => e.key) } },
      { $set: { status: "resolved" }, $push: { history: { at: now, action: "resolved" } as IMarketSuggestionHistory } },
    );
  }

  const perArea = new Map<string, number>();
  for (const s of result.suggestions) {
    if (s.kind === "find_employers" || s.kind === "thin_supply") perArea.set(s.areaId ?? "", (perArea.get(s.areaId ?? "") ?? 0) + s.seekers);
  }
  const areas = [...perArea.entries()]
    .map(([id, n]) => ({ areaId: id ? new mongoose.Types.ObjectId(id) : null, name: id ? (cityName.get(id) ?? "") : "", seekers: n }))
    .sort((a, b) => b.seekers - a.seekers)
    .slice(0, 12);
  const durationMs = Date.now() - started;
  await MarketGapSnapshot.create({
    generatedAt: now,
    trigger,
    seekersConsidered: result.seekersConsidered,
    noAreaCount: result.noAreaCount,
    noRoleCount: result.noRoleCount,
    activeJobs: jobs.length,
    areas,
    durationMs,
  });

  return { suggestions: result.suggestions.length, reopened, resolved: gone.length, seekersConsidered: result.seekersConsidered, durationMs };
}
