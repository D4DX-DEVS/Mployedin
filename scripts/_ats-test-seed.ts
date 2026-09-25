/**
 * ATS test fixture: two real-looking jobs on one employer, real CVs turned into
 * job seekers, each applying with screening answers, then scored through the
 * same code the screening worker runs. Local use only — never commit; the
 * candidate data lives in a JSON file outside the repo.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/_ats-test-seed.ts <data.json>
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/_ats-test-seed.ts <data.json> --delete
 *
 * Accounts use the data file's emailDomain (a .test domain, undeliverable) and
 * have every notification channel set to in-app, so nothing is ever emailed.
 * No Inngest events are sent: scoring runs inline, without the LLM narrative.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import NotificationPreference, { CATEGORY_KEYS } from "@/models/NotificationPreference";
import { splitScreeningQuestions } from "@/lib/matching/knockouts";
import { applicantMatchUpdate, scoreApplicationsOfJob } from "@/lib/matching/scoreApplication";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";
import CvDocument from "@/models/CvDocument";
import { uploadBuffer, deleteFile } from "@/lib/storage/spaces";

interface JobSpec {
  key: string;
  title: string;
  category: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  benefits: string[];
  requirements: Record<string, unknown>;
  salary: { min: number; max: number; currency: string; period: "monthly" | "yearly" | "lpa" };
  tags: string[];
  screeningQuestions: Array<{
    id: string; label: string; type: string; options?: string[]; required?: boolean; order?: number;
    knockout?: boolean; acceptedAnswers?: string[]; minValue?: number;
  }>;
}

interface CandidateSpec {
  alias: string;
  name: string;
  applyTo: string;
  cv: string;
  location: string;
  nationality: string;
  headline: string;
  years: number;
  skills: string[];
  experience: Array<{ jobTitle: string; company: string; start: string; end: string | null; country: string }>;
  education: Array<{ degree: string; institution: string; year?: number }>;
  languages: Array<[string, string]>;
  answers: Record<string, string | number>;
}

interface Fixture {
  emailDomain: string;
  password: string;
  employerEmail: string;
  jobs: JobSpec[];
  candidates: CandidateSpec[];
}

const args = process.argv.slice(2);
const dataPath = args.find((a) => !a.startsWith("--"));
if (!dataPath) throw new Error("Pass the fixture JSON path");
const DELETE = args.includes("--delete");
/** Upload each candidate's real PDF and attach it, as a plain upload + apply would: file only, no text. */
const ATTACH_CVS = args.includes("--attach-cvs");
/** Print the current ranking only; seed nothing. */
const REPORT_ONLY = args.includes("--report");
/** Aliases whose profile is left sparse, like a seeker who typed very little. */
const THIN = new Set((args.includes("--thin") ? args[args.indexOf("--thin") + 1] : "").split(",").filter(Boolean));
const statePath = path.join(path.dirname(dataPath), "ats-test-state.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8")) as Fixture;

const emailOf = (c: CandidateSpec) => `${c.alias}@${data.emailDomain}`;
const month = (ym: string) => new Date(`${ym}-01T00:00:00.000Z`);

/** The CV's text, without contact details or personal particulars. */
function cvText(file: string): string {
  let raw = "";
  try {
    raw = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
  return raw
    .split(/\r?\n/)
    .filter((line) => !/date of birth|d\.o\.b|religion|marital|pincode|house|linkedin|portfolio|github/i.test(line))
    .join("\n")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "")
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, (m) => ((m.match(/\d/g) ?? []).length >= 9 ? "" : m))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function remove(): Promise<void> {
  const users = await User.find({ email: { $regex: `@${data.emailDomain.replace(/\./g, "\\.")}$` } }).select("_id").lean();
  const userIds = users.map((u) => u._id);
  const seekers = await JobSeeker.find({ userId: { $in: userIds } }).select("_id").lean();
  const seekerIds = seekers.map((s) => s._id);
  const cvDocs = (await CvDocument.find({ jobSeekerId: { $in: seekerIds } }).select("fileUrl").lean()) as Array<{ fileUrl: string }>;
  for (const d of cvDocs) await deleteFile(d.fileUrl).catch(() => undefined);
  await CvDocument.deleteMany({ jobSeekerId: { $in: seekerIds } });
  const apps = await Application.deleteMany({ jobSeekerId: { $in: seekerIds } });
  await Job.updateMany({ applicantIds: { $in: seekerIds } }, { $pull: { applicantIds: { $in: seekerIds } } });
  const state = fs.existsSync(statePath) ? (JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, string>) : {};
  const jobs = await Job.deleteMany({ _id: { $in: Object.values(state) } });
  await NotificationPreference.deleteMany({ userId: { $in: userIds } });
  await JobSeeker.deleteMany({ _id: { $in: seekerIds } });
  await User.deleteMany({ _id: { $in: userIds } });
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  process.stdout.write(`Deleted ${users.length} users, ${apps.deletedCount} applications, ${jobs.deletedCount} jobs, ${cvDocs.length} CV files.\n`);
}

async function upsertJobs(employerId: mongoose.Types.ObjectId): Promise<Map<string, mongoose.Types.ObjectId>> {
  const state = fs.existsSync(statePath) ? (JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, string>) : {};
  const ids = new Map<string, mongoose.Types.ObjectId>();
  for (const spec of data.jobs) {
    // The same split the jobs API does: qualifying answers stay private.
    const { questions, knockouts } = splitScreeningQuestions(spec.screeningQuestions);
    const fields = {
      employerId,
      title: spec.title,
      description: spec.description,
      requirements: { nationality: [], ...spec.requirements },
      employmentType: "full_time",
      workMode: "onsite",
      responsibilities: spec.responsibilities,
      qualifications: spec.qualifications,
      benefits: spec.benefits,
      salary: { ...spec.salary, isNegotiable: true },
      location: { country: "India", city: "Ernakulam", isRemote: false },
      status: "active",
      workflowMode: "manual",
      screeningQuestions: questions,
      screeningKnockouts: knockouts,
      vacancies: 1,
      showSalary: true,
      tags: spec.tags,
      visibility: "public",
      category: spec.category,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deletedAt: null,
    };
    const existing = state[spec.key] ? await Job.findById(state[spec.key]).select("_id").lean() : null;
    const id = existing
      ? (await Job.findByIdAndUpdate(existing._id, { $set: fields }, { returnDocument: "after" }))!._id
      : (await Job.create(fields))._id;
    ids.set(spec.key, id as mongoose.Types.ObjectId);
    state[spec.key] = String(id);
    process.stdout.write(`Job "${spec.title}" ${existing ? "updated" : "created"}: ${String(id)}\n`);
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return ids;
}

async function seedCandidate(
  c: CandidateSpec,
  job: { _id: mongoose.Types.ObjectId; employerId: unknown; agentId?: unknown; spec: JobSpec },
  passwordHash: string,
): Promise<mongoose.Types.ObjectId> {
  const email = emailOf(c);
  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: c.name, email, passwordHash, role: "job_seeker", locale: "en",
        isActive: true, isEmailVerified: true, authProvider: "credentials",
        failedLoginAttempts: 0, permissionMode: "role_default",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  // In-app only, every category: a .test address bounces, and bounces count
  // against the platform's daily sending cap.
  const categories = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, { enabled: true, channels: ["in_app"] }]));
  await NotificationPreference.findOneAndUpdate(
    { userId: user._id },
    { $set: { userId: user._id, emailFrequency: "none", categories } },
    { upsert: true },
  );

  const profile = {
    userId: user._id,
    fullName: c.name,
    ...(c.nationality ? { nationality: c.nationality } : {}),
    currentLocation: c.location,
    headline: c.headline,
    summary: `${c.headline}. ${c.years}+ years of experience, most recently as ${c.experience[0].jobTitle} at ${c.experience[0].company}.`,
    workStatus: "experienced",
    totalExperienceYears: c.years,
    totalExperienceMonths: 0,
    skills: c.skills,
    experience: c.experience.map((e) => ({
      jobTitle: e.jobTitle,
      company: e.company,
      startDate: month(e.start),
      endDate: e.end ? month(e.end) : null,
      isCurrent: e.end === null,
      country: e.country,
    })),
    education: c.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      ...(e.year ? { graduationDate: new Date(`${e.year}-06-01T00:00:00.000Z`) } : {}),
    })),
    languages: c.languages.map(([language, proficiency]) => ({ language, proficiency })),
    preferredJobType: "onsite",
    availabilityStatus: "within_month",
    profileCompleteness: 85,
    // Test people: kept out of the employer talent search, visible as applicants.
    profileVisibility: "hidden",
    isOnboarded: true,
    marketingConsent: false,
    cv: { rawText: cvText(c.cv), parsedAt: new Date(), downloadCount: 0 },
  };
  if (THIN.has(c.alias)) {
    // Typed in a hurry: a headline, three skills, nothing else.
    Object.assign(profile, {
      summary: c.headline,
      skills: c.skills.slice(0, 3),
      experience: [],
      education: [],
      languages: [],
      totalExperienceYears: 0,
      profileCompleteness: 40,
    });
  }
  let cvUrl: string | null = null;
  if (ATTACH_CVS) {
    // A fresh file per run; the previous run's file and reading go.
    const existing = await JobSeeker.findOne({ userId: user._id }).select("_id").lean();
    if (existing) {
      const old = (await CvDocument.find({ jobSeekerId: existing._id }).select("fileUrl").lean()) as Array<{ fileUrl: string }>;
      for (const d of old) await deleteFile(d.fileUrl).catch(() => undefined);
      await CvDocument.deleteMany({ jobSeekerId: existing._id });
    }
    const uploaded = await uploadBuffer(fs.readFileSync(c.cv), {
      folder: "cvs",
      fileName: path.basename(c.cv),
      contentType: "application/pdf",
      private: true,
    });
    cvUrl = uploaded.url;
    // A plain upload stored the file and nothing else.
    Object.assign(profile, { cv: { originalUrl: cvUrl, downloadCount: 0 } });
  }
  const seeker = await JobSeeker.findOneAndUpdate(
    { userId: user._id },
    { $set: profile },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  const screeningAnswers = job.spec.screeningQuestions.map((q) => ({
    questionId: q.id,
    questionLabel: q.label,
    answer: c.answers[q.id],
  }));
  const { signals, score } = computeBehaviorSignals({
    profileCompleteness: 85,
    documents: [],
    coverLetter: "",
    source: "full_form",
    autoApplied: false,
    lastActiveAt: new Date(),
  });
  const appliedAt = new Date();
  const app = await Application.findOneAndUpdate(
    { jobSeekerId: seeker._id, jobId: job._id },
    {
      $set: {
        jobSeekerId: seeker._id,
        jobId: job._id,
        employerId: job.employerId,
        ...(job.agentId ? { agentId: job.agentId } : {}),
        status: "applied",
        source: "full_form",
        appliedAt,
        behaviorSignals: signals,
        behaviorScore: score,
        screeningAnswers,
        documents: cvUrl ? [{ name: "CV", url: cvUrl, type: "resume" }] : [],
        isAgentReferred: false,
        statusHistory: [{ status: "applied", changedAt: appliedAt, note: "Application submitted" }],
      },
      // A re-run starts from unscored, like a fresh application.
      $unset: {
        aiMatchScore: 1, seekerMatchScore: 1, matchBreakdown: 1, matchedSkills: 1, missingSkills: 1,
        qualifications: 1, requirementsStatus: 1, weightsApplied: 1, scoredAt: 1, scoredVia: 1,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await Job.updateOne({ _id: job._id }, { $addToSet: { applicantIds: seeker._id } });
  await JobSeeker.updateOne({ _id: seeker._id }, { $addToSet: { applicationIds: app._id } });
  return app._id as mongoose.Types.ObjectId;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Run with --env-file=.env");
  await mongoose.connect(uri);

  if (DELETE) {
    await remove();
    await mongoose.disconnect();
    return;
  }

  const owner = await User.findOne({ email: data.employerEmail }).select("_id").lean();
  const employer = owner ? await Employer.findOne({ userId: owner._id }).select("_id companyName").lean() : null;
  if (!employer) throw new Error(`No employer for ${data.employerEmail}`);
  process.stdout.write(`Employer: ${(employer as { companyName?: string }).companyName} (${String(employer._id)})\n`);

  if (REPORT_ONLY) {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, string>;
    await report(new Map(Object.entries(state).map(([k, v]) => [k, new mongoose.Types.ObjectId(v)])));
    await mongoose.disconnect();
    return;
  }

  const jobIds = await upsertJobs(employer._id as mongoose.Types.ObjectId);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const appsByJob = new Map<string, string[]>();
  for (const c of data.candidates) {
    const spec = data.jobs.find((j) => j.key === c.applyTo)!;
    const jobId = jobIds.get(c.applyTo)!;
    const appId = await seedCandidate(c, { _id: jobId, employerId: employer._id, spec }, passwordHash);
    appsByJob.set(String(jobId), [...(appsByJob.get(String(jobId)) ?? []), String(appId)]);
    process.stdout.write(`  applied: ${c.name.padEnd(26)} -> ${spec.title}  (${emailOf(c)})\n`);
  }

  // Score exactly as the screening worker does (engine + checklist), no LLM notes.
  for (const [jobId, ids] of appsByJob) {
    const scored = await scoreApplicationsOfJob(jobId, ids);
    if (scored.length > 0) {
      await Application.bulkWrite(
        scored.map(({ applicationId, match }) => ({
          updateOne: {
            filter: { _id: applicationId },
            update: { $set: applicantMatchUpdate(match) },
          },
        })),
      );
    }
  }

  await report(jobIds);
  process.stdout.write(`\nSeeker password: ${data.password}\n`);
  await mongoose.disconnect();
}

/** What the employer sees: best first, then what Shortlist Top would take. */
async function report(jobIds: Map<string, mongoose.Types.ObjectId>): Promise<void> {
  for (const spec of data.jobs) {
    const jobId = jobIds.get(spec.key)!;
    const rows = (await Application.find({ jobId })
      .sort({ aiMatchScore: -1 })
      .populate({ path: "jobSeekerId", select: "fullName" })
      .select("jobSeekerId aiMatchScore seekerMatchScore requirementsStatus qualifications matchBreakdown weightsApplied")
      .lean()) as unknown as Array<{
        jobSeekerId: { fullName?: string } | null;
        aiMatchScore?: number; seekerMatchScore?: number; requirementsStatus?: string; weightsApplied?: boolean;
        matchBreakdown?: Record<string, number>;
        qualifications?: Array<{ key: string; status: string; hard: boolean; label?: string; required?: string; actual?: string }>;
      }>;
    process.stdout.write(`\n=== ${spec.title} (${String(jobId)}) ===\n`);
    for (const r of rows) {
      const failed = (r.qualifications ?? [])
        .filter((q) => q.status === "not_met" || q.status === "partial" || q.status === "unknown")
        .map((q) => `${q.hard ? "HARD " : ""}${q.label ?? q.key}=${q.status}(${q.actual ?? "-"} vs ${q.required ?? "-"})`);
      const b = r.matchBreakdown ?? {};
      process.stdout.write(
        `${(r.jobSeekerId?.fullName ?? "?").padEnd(26)} emp ${String(r.aiMatchScore ?? "-").padStart(3)} | seeker ${String(r.seekerMatchScore ?? "-").padStart(3)} | ${String(r.requirementsStatus).padEnd(10)} | sk ${b.skills} role ${b.role} exp ${b.experience} edu ${b.education ?? "-"} ind ${b.industry ?? "-"} | loc ${(r.qualifications ?? []).find((q) => q.key === "location")?.status ?? "-"} | cv ${(r.qualifications ?? []).find((q) => q.key === "cv")?.actual ?? "-"} | weights ${r.weightsApplied ? "yes" : "no"}\n` +
        (failed.length ? `    ${failed.join("\n    ")}\n` : ""),
      );
    }
    const shortlist = rows.filter((r) => r.requirementsStatus !== "not_met" && r.aiMatchScore != null);
    process.stdout.write(
      `Shortlist Top pool: ${shortlist.map((r) => r.jobSeekerId?.fullName).join(", ") || "none"}; ` +
      `left out for a failed requirement: ${rows.length - shortlist.length}\n`,
    );
  }
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
