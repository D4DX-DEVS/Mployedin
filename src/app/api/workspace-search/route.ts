import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimitDual } from "@/lib/security/rateLimit";
import { escapeRegex } from "@/lib/security/sanitize";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { Job } from "@/models/Job";
import { Application } from "@/models/Application";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import type { AuthContext } from "@/lib/auth/withAuth";

const MAX_PER_GROUP = 5;
const MIN_QUERY_LENGTH = 2;
/** Upper bound on seekers resolved by name before the application lookup. */
const MAX_NAME_MATCHES = 50;

export interface WorkspaceSearchJob {
  id: string;
  title: string;
  status: string;
}

export interface WorkspaceSearchCandidate {
  /** Application _id — the row the command palette deep-links to. */
  id: string;
  name: string;
  jobTitle: string;
  status: string;
}

/**
 * An employer, agent, super-agent or platform user. Admin-only: for every other
 * role the palette's two groups are the whole workspace, but an admin's day is
 * mostly people lookups and the palette could not answer one.
 */
export interface WorkspaceSearchPerson {
  id: string;
  name: string;
  detail: string;
  /** Which admin list opens this record. */
  href: string;
}

export interface WorkspaceSearchResult {
  jobs: WorkspaceSearchJob[];
  candidates: WorkspaceSearchCandidate[];
  people?: WorkspaceSearchPerson[];
}

const EMPTY: WorkspaceSearchResult = { jobs: [], candidates: [], people: [] };

/**
 * A job seeker's two entities are an open job and one of their own
 * applications — never another person's record. The second group reuses the
 * `candidates` field the palette already renders, carrying the job title as
 * its `name`, because that is what the seeker recognises and what
 * `/job-seeker/applications?search=` filters on.
 */
async function jobSeekerSearch(query: string, userId: string): Promise<WorkspaceSearchResult> {
  const rx = new RegExp(escapeRegex(query), "i");

  const seeker = await JobSeeker.findOne({ userId }).select("_id").lean();

  // Same visibility rule the jobs list applies to a seeker: active and
  // unexpired only. A draft or closed job is not theirs to open.
  const jobDocs = await Job.find({
    deletedAt: null,
    status: "active",
    title: rx,
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
  })
    .select("title status")
    .sort({ updatedAt: -1 })
    .limit(MAX_PER_GROUP)
    .lean();

  const jobs: WorkspaceSearchJob[] = jobDocs.map((job) => ({
    id: String(job._id),
    title: String(job.title ?? ""),
    status: String(job.status ?? ""),
  }));

  if (!seeker) return { jobs, candidates: [] };

  const applicationDocs = await Application.find({ jobSeekerId: seeker._id })
    .select("status jobId appliedAt")
    .populate({ path: "jobId", select: "title" })
    .sort({ appliedAt: -1 })
    .limit(200)
    .lean();

  type SeekerApplication = {
    _id: mongoose.Types.ObjectId;
    status?: string;
    jobId?: { title?: string } | null;
  };

  const candidates: WorkspaceSearchCandidate[] = [];
  for (const doc of applicationDocs as unknown as SeekerApplication[]) {
    const title = doc.jobId?.title ?? "";
    if (!title || !rx.test(title)) continue;
    candidates.push({
      id: String(doc._id),
      name: title,
      jobTitle: "",
      status: String(doc.status ?? ""),
    });
    if (candidates.length >= MAX_PER_GROUP) break;
  }

  return { jobs, candidates };
}

/**
 * GET /api/workspace-search?q=<query>
 *
 * Entity search behind the ⌘K palette: finds a specific job or a specific
 * candidate by name so a staff user can jump straight to the record instead of
 * walking the sidebar down to a list and filtering it.
 *
 * Scoping mirrors every other employer-scoped read: `getScopedEmployerIds`
 * returns `null` for admin only ("no employer filter"); every other role gets
 * an explicit id list, and an empty list means "see nothing". A job seeker
 * takes a separate path (`jobSeekerSearch`) scoped to open jobs and their own
 * applications — none of the employer-scoped records are theirs to read.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  const rl = await checkRateLimitDual(req, ctx.userId, {
    limit: 30,
    windowSec: 60,
    prefix: "workspace-search",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many searches. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const query = raw.trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(EMPTY);
  }

  await connectDB();

  if (ctx.role === "job_seeker") {
    return NextResponse.json(await jobSeekerSearch(query, ctx.userId));
  }

  const employerIds = await getScopedEmployerIds({ userId: ctx.userId, role: ctx.role });
  // `null` = admin (no employer filter). An empty array is a real "see nothing"
  // answer and must not widen into an unfiltered read.
  if (employerIds !== null && employerIds.length === 0) {
    return NextResponse.json(EMPTY);
  }
  const employerFilter =
    employerIds === null ? {} : { employerId: { $in: employerIds } };

  const rx = new RegExp(escapeRegex(query), "i");

  const jobDocs = await Job.find({ ...employerFilter, title: rx })
    .select("title status")
    .sort({ updatedAt: -1 })
    .limit(MAX_PER_GROUP)
    .lean();

  const jobs: WorkspaceSearchJob[] = jobDocs.map((job) => ({
    id: String(job._id),
    title: String(job.title ?? ""),
    status: String(job.status ?? ""),
  }));

  // A candidate's display name lives on User (via JobSeeker.userId) with a
  // JobSeeker.fullName fallback. The name match used to run in JavaScript over
  // the 400 most recent applications, which for an admin meant the newest 400
  // platform-wide: searching someone who applied last month returned nothing,
  // silently. Resolving the seekers first turns it into a bounded, indexed
  // query that cannot miss an older application.
  const [matchingUsers, matchingSeekersByName] = await Promise.all([
    User.find({ name: rx }).select("_id").limit(MAX_NAME_MATCHES).lean(),
    JobSeeker.find({ fullName: rx }).select("_id").limit(MAX_NAME_MATCHES).lean(),
  ]);

  const seekerIdsFromUsers = matchingUsers.length
    ? await JobSeeker.find({ userId: { $in: matchingUsers.map((user) => user._id) } })
        .select("_id")
        .limit(MAX_NAME_MATCHES)
        .lean()
    : [];

  const seekerIds = [
    ...new Set(
      [...matchingSeekersByName, ...seekerIdsFromUsers].map((seeker) => String(seeker._id)),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const applicationDocs = seekerIds.length
    ? await Application.find({ ...employerFilter, jobSeekerId: { $in: seekerIds } })
        .select("status jobId jobSeekerId appliedAt")
        .populate({ path: "jobId", select: "title" })
        .populate({
          path: "jobSeekerId",
          select: "fullName userId",
          populate: { path: "userId", select: "name" },
        })
        .sort({ appliedAt: -1 })
        .limit(MAX_PER_GROUP)
        .lean()
    : [];

  type PopulatedApplication = {
    _id: mongoose.Types.ObjectId;
    status?: string;
    jobId?: { title?: string } | null;
    jobSeekerId?: { fullName?: string; userId?: { name?: string } | null } | null;
  };

  const candidates: WorkspaceSearchCandidate[] = [];
  for (const doc of applicationDocs as unknown as PopulatedApplication[]) {
    const name = doc.jobSeekerId?.userId?.name ?? doc.jobSeekerId?.fullName ?? "";
    if (!name) continue;
    candidates.push({
      id: String(doc._id),
      name,
      jobTitle: doc.jobId?.title ?? "",
      status: String(doc.status ?? ""),
    });
    if (candidates.length >= MAX_PER_GROUP) break;
  }

  // Admins search people far more than they search jobs, and had no way to do
  // it from the palette. Scoped to admin because the destinations are admin
  // routes; every other role keeps the two groups it had.
  let people: WorkspaceSearchPerson[] = [];
  if (ctx.role === "admin") {
    const [employerDocs, userDocs] = await Promise.all([
      Employer.find({ companyName: rx }).select("companyName industry").limit(MAX_PER_GROUP).lean(),
      User.find({ $or: [{ name: rx }, { email: rx }], role: { $ne: "job_seeker" } })
        .select("name email role")
        .limit(MAX_PER_GROUP)
        .lean(),
    ]);

    const userListPath: Record<string, string> = {
      admin: "/admin/users",
      agent: "/admin/agents",
      super_agent: "/admin/super-agents",
      employer: "/admin/employers",
    };

    /* Several employer documents can share a companyName — the jobs handler
       already compensates for those duplicate profiles when filtering. In the
       palette they render as the same company three times over, so collapse
       them to the name the reader actually distinguishes. */
    const seenNames = new Set<string>();
    people = [
      ...employerDocs.map((employer) => ({
        id: String(employer._id),
        name: String(employer.companyName ?? ""),
        detail: String(employer.industry ?? ""),
        href: `/admin/employers?search=${encodeURIComponent(String(employer.companyName ?? ""))}`,
      })),
      ...userDocs.map((user) => ({
        id: String(user._id),
        name: String(user.name ?? user.email ?? ""),
        detail: String(user.role ?? ""),
        href: `${userListPath[String(user.role)] ?? "/admin/users"}?search=${encodeURIComponent(String(user.name ?? user.email ?? ""))}`,
      })),
    ]
      .filter((person) => {
        const key = person.name.trim().toLowerCase();
        if (!key || seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      })
      .slice(0, MAX_PER_GROUP * 2);
  }

  return NextResponse.json({ jobs, candidates, people } satisfies WorkspaceSearchResult);
}

export const GET = withAuth(handler);
