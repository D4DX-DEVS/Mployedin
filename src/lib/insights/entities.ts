/**
 * The AI Data Access entity registry — one allow-list per collection.
 *
 * Every field an external AI can read is declared here with a type and a
 * one-line meaning. Anything not declared is never projected, so password
 * hashes, tokens, 2FA material, key hashes, raw CV/document URLs and free-text
 * private notes cannot leak by construction. Files are reported as counts /
 * booleans instead (e.g. `hasCv`, `documentsCount`).
 *
 * Route handlers (/api/insights/*) and MCP tools (insights_*) both read this.
 */
import type { Model } from "mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import Lead from "@/models/Lead";
import AuditLog from "@/models/AuditLog";
import { INVOICE_STATUSES } from "@/lib/invoices/status";
import { mrrOf } from "@/lib/subscriptions/mrr";
import type { EntityDef, FieldDef, FieldType, FilterDef } from "./types";

type AnyModel = Model<Record<string, unknown>>;
const m = (model: unknown) => () => model as AnyModel;

export function getPath(doc: Record<string, unknown>, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function f(name: string, type: FieldType, desc: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { name, type, desc, ...extra };
}

/** Count of an array path, e.g. `documentsCount` from `documents`. */
function count(name: string, path: string, desc: string, extra: Partial<FieldDef> = {}): FieldDef {
  return f(name, "number", desc, {
    src: [path],
    compute: (d) => {
      const v = getPath(d, path);
      return Array.isArray(v) ? v.length : 0;
    },
    ...extra,
  });
}

/** Boolean "present" flag for a value we never return itself (URLs, tokens…). */
function has(name: string, path: string, desc: string): FieldDef {
  return f(name, "boolean", desc, {
    src: [path],
    compute: (d) => {
      const v = getPath(d, path);
      return Array.isArray(v) ? v.length > 0 : Boolean(v);
    },
  });
}

const ID = f("_id", "objectId", "Record id (24-hex ObjectId). Use with /{entity}/{id}.");
const CREATED = f("createdAt", "date", "When the record was created (ISO 8601, UTC).");
const UPDATED = f("updatedAt", "date", "When the record was last modified (ISO 8601, UTC).");

const filt = (
  param: string,
  type: FilterDef["type"],
  desc: string,
  extra: Partial<FilterDef> = {},
): FilterDef => ({ param, path: param, type, desc, ...extra });

const USER_ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"] as const;
const JOB_STATUSES = ["draft", "active", "paused", "closed", "expired"] as const;
const APPLICATION_STATUSES = [
  "applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn",
] as const;
const INTERVIEW_STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "rescheduled", "no_show"] as const;
const OFFER_STATUSES = ["pending", "accepted", "declined", "expired", "withdrawn", "countered"] as const;
const PLACEMENT_STATUSES = ["active", "completed", "terminated"] as const;
const COMMISSION_STATUSES = ["pending", "approved", "paid", "disputed", "clawed_back"] as const;
const SUBSCRIPTION_STATUSES = ["active", "expired", "cancelled", "suspended"] as const;
const LEAD_STATUSES = ["new", "contacted", "interested", "negotiating", "converted", "lost"] as const;

const USER_JOIN_FIELD = f(
  "user",
  "object",
  "Owning user account: { name, email, phone, isActive, lastLogin }. name/email/phone are PII.",
  { src: [] },
);

export const ENTITIES: EntityDef[] = [
  // ── Users ──────────────────────────────────────────────────────────────────
  {
    key: "users",
    label: "Users",
    description: "Every login account on the platform, one per person, with its role.",
    model: m(User),
    fields: [
      ID,
      f("name", "string", "Display name of the person.", { pii: "name" }),
      f("email", "string", "Login e-mail address.", { pii: "email" }),
      f("phone", "string", "Phone number, if given.", { pii: "phone" }),
      f("role", "string", "Platform role.", { enum: USER_ROLES }),
      f("isActive", "boolean", "False when an admin has deactivated the account."),
      f("isEmailVerified", "boolean", "Whether the e-mail address was verified."),
      f("authProvider", "string", "How the user signs in.", { enum: ["credentials", "google", "linkedin", "apple"] }),
      f("locale", "string", "UI language.", { enum: ["en", "ar"] }),
      f("permissionMode", "string", "role_default, or custom when an admin narrowed/extended permissions."),
      has("hasAvatar", "avatar", "Whether a profile photo is set."),
      f("lastLogin", "date", "Last successful sign-in."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("role", "string", "Filter by platform role.", { enum: USER_ROLES }),
      filt("isActive", "boolean", "true/false."),
      filt("isEmailVerified", "boolean", "true/false."),
      filt("authProvider", "string", "credentials | google | linkedin | apple."),
      filt("email", "string", "Exact e-mail (case-insensitive). Requires pii:read.", { op: "ieq", pii: true }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "lastLogin", "name"],
    groupable: ["role", "isActive", "isEmailVerified", "authProvider", "locale"],
    numeric: [],
    searchFields: [{ path: "name", pii: true }, { path: "email", pii: true }],
  },

  // ── Employers ──────────────────────────────────────────────────────────────
  {
    key: "employers",
    label: "Employers",
    description: "Hiring companies. One per employer owner account (userId).",
    model: m(Employer),
    fields: [
      ID,
      f("userId", "objectId", "Owner user account (see /users/{id})."),
      f("agentId", "objectId", "Agent who manages this employer (see /agents/{id})."),
      f("companyName", "string", "Company name (not PII)."),
      f("companyEmail", "string", "Company contact e-mail.", { pii: "email" }),
      f("phone", "string", "Company phone.", { pii: "phone" }),
      f("designation", "string", "Job title of the owner at the company."),
      f("industry", "string", "Industry."),
      f("companySize", "string", "Headcount band."),
      f("city", "string", "City."),
      f("country", "string", "Country."),
      f("address", "string", "Street address.", { pii: "text", detailOnly: true }),
      f("website", "string", "Company website."),
      f("foundedYear", "number", "Year founded."),
      f("description", "string", "Company description.", { detailOnly: true }),
      f("verificationLevel", "string", "Verification tier.", { enum: ["basic", "company", "premium"] }),
      f("verifiedAt", "date", "When verification was granted."),
      f("domainVerified", "boolean", "Company e-mail domain verified."),
      f("isAgentVerified", "boolean", "An agent vouched for this company."),
      count("verificationDocsCount", "verificationDocs", "Number of verification documents uploaded (files are never returned)."),
      has("hasLogo", "logo", "Whether a logo is uploaded."),
      f("workflowMode", "string", "auto = platform moves candidates automatically; manual = employer drives.", { enum: ["auto", "manual"] }),
      f("paymentStatus", "string", "Billing standing.", { enum: ["active", "pending", "overdue"] }),
      f("subscriptionType", "string", "Legacy plan flag.", { enum: ["basic", "premium"] }),
      f("isActive", "boolean", "False when the owner account is deactivated."),
      f("isOnboarded", "boolean", "Finished onboarding."),
      f("createdVia", "string", "self | admin | role_conversion."),
      count("jobsCount", "jobIds", "Number of jobs ever linked to this employer."),
      f("roleArchivedAt", "date", "Set when the owner was converted away from the employer role."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("agentId", "objectId", "Employers managed by this agent."),
      filt("country", "string", "Country (case-insensitive exact).", { op: "ieq" }),
      filt("city", "string", "City (case-insensitive exact).", { op: "ieq" }),
      filt("industry", "string", "Industry (case-insensitive exact).", { op: "ieq" }),
      filt("verificationLevel", "string", "basic | company | premium."),
      filt("paymentStatus", "string", "active | pending | overdue."),
      filt("isActive", "boolean", "true/false."),
      filt("status", "string", "Alias: active → isActive=true, inactive → isActive=false.", { path: "isActive", enum: ["active", "inactive"], valueMap: { active: true, inactive: false } }),
      filt("isOnboarded", "boolean", "true/false."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "companyName", "verifiedAt"],
    groupable: [
      "country", "city", "industry", "companySize", "verificationLevel", "paymentStatus",
      "subscriptionType", "isActive", "isOnboarded", "agentId", "workflowMode", "createdVia",
    ],
    numeric: ["foundedYear"],
    searchFields: [{ path: "companyName" }],
  },

  // ── Job seekers ────────────────────────────────────────────────────────────
  {
    key: "job-seekers",
    label: "Job seekers",
    description: "Candidate profiles (one per job_seeker user). CV files are never returned — use hasCv / cvAtsScore.",
    model: m(JobSeeker),
    fields: [
      ID,
      f("userId", "objectId", "Candidate's user account."),
      f("agentId", "objectId", "Agent the candidate is assigned to, if any."),
      f("fullName", "string", "Candidate full name.", { pii: "name" }),
      f("headline", "string", "Profile headline."),
      f("nationality", "string", "Nationality."),
      f("gender", "string", "Self-declared gender.", { pii: "text" }),
      f("currentLocation", "string", "Current city/country (free text)."),
      f("skills", "array", "Skills (strings)."),
      f("industry", "string", "Current industry."),
      f("workStatus", "string", "experienced | fresher."),
      f("totalExperienceYears", "number", "Years of experience (whole years)."),
      f("totalExperienceMonths", "number", "Additional months of experience."),
      f("preferredCountries", "array", "Countries the candidate wants to work in."),
      f("preferredRoles", "array", "Roles the candidate wants."),
      f("preferredJobType", "string", "remote | hybrid | onsite | any."),
      f("preferredSalary", "object", "{ min, max, currency } expected salary.", { detailOnly: true }),
      f("availabilityStatus", "string", "immediately | within_month | within_3_months | not_available."),
      f("noticePeriod", "number", "Notice period in days."),
      f("profileCompleteness", "number", "0–100 profile completeness score."),
      f("profileVisibility", "string", "visible | hidden to employers."),
      f("isOnboarded", "boolean", "Finished onboarding."),
      f("isAgentReferred", "boolean", "Came in through an agent / super-agent referral link."),
      f("applicationMode", "string", "auto = auto-apply enabled; manual."),
      has("hasCv", "cv.originalUrl", "Whether a CV file is uploaded (the file is never returned)."),
      f("cvAtsScore", "number", "Cached ATS-friendliness score 0–100 of the CV.", { src: ["cv.atsScore"], compute: (d) => getPath(d, "cv.atsScore") ?? null }),
      f("cvDownloadCount", "number", "Times employers/agents downloaded the CV.", { src: ["cv.downloadCount"], compute: (d) => getPath(d, "cv.downloadCount") ?? 0 }),
      f("cvExtractedByAI", "boolean", "Profile was auto-filled from the CV."),
      count("documentsCount", "documents", "Number of uploaded documents (files are never returned)."),
      count("experienceCount", "experience", "Number of work-experience entries."),
      count("educationCount", "education", "Number of education entries."),
      f("summary", "string", "Profile summary.", { detailOnly: true }),
      f("roleArchivedAt", "date", "Set when the user was converted away from the job_seeker role."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("agentId", "objectId", "Candidates assigned to this agent."),
      filt("availabilityStatus", "string", "immediately | within_month | within_3_months | not_available."),
      filt("workStatus", "string", "experienced | fresher."),
      filt("nationality", "string", "Nationality (case-insensitive exact).", { op: "ieq" }),
      filt("industry", "string", "Industry (case-insensitive exact).", { op: "ieq" }),
      filt("preferredJobType", "string", "remote | hybrid | onsite | any."),
      filt("profileVisibility", "string", "visible | hidden."),
      filt("isOnboarded", "boolean", "true/false."),
      filt("isAgentReferred", "boolean", "true/false."),
      filt("skill", "string", "Has this skill (case-insensitive exact).", { path: "skills", op: "ieq" }),
      filt("minExperience", "number", "totalExperienceYears ≥ value.", { path: "totalExperienceYears", op: "gte" }),
      filt("minCompleteness", "number", "profileCompleteness ≥ value.", { path: "profileCompleteness", op: "gte" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "profileCompleteness", "totalExperienceYears"],
    groupable: [
      "nationality", "industry", "workStatus", "availabilityStatus", "preferredJobType",
      "profileVisibility", "isOnboarded", "isAgentReferred", "applicationMode", "agentId", "skills", "preferredCountries",
    ],
    numeric: ["totalExperienceYears", "profileCompleteness", "noticePeriod", "cv.atsScore"],
    searchFields: [{ path: "headline" }, { path: "fullName", pii: true }],
  },

  // ── Agents ─────────────────────────────────────────────────────────────────
  {
    key: "agents",
    label: "Agents",
    description: "Field recruiters. Each manages employers and candidates and earns commission on placements.",
    model: m(Agent),
    joinUser: true,
    fields: [
      ID,
      f("userId", "objectId", "Agent's user account."),
      USER_JOIN_FIELD,
      f("superAgentId", "objectId", "Super-agent this agent reports to."),
      f("referralCode", "string", "Public referral code used in referral links."),
      f("country", "string", "Country of operation."),
      f("currencyCode", "string", "Default currency."),
      f("commissionRate", "number", "Commission percentage on placements."),
      count("assignedEmployersCount", "assignedEmployerIds", "Employers assigned."),
      count("assignedJobSeekersCount", "assignedJobSeekerIds", "Candidates assigned."),
      count("assignedCitiesCount", "assignedCityIds", "Cities in territory."),
      f("performance", "object", "Counters: leadsGenerated, employersCreated, vacanciesPosted, jobSeekersSubmitted, interviewsScheduled, placementsCompleted."),
      f("roleArchivedAt", "date", "Set when converted away from the agent role."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("superAgentId", "objectId", "Agents under this super-agent."),
      filt("country", "string", "Country (case-insensitive exact).", { op: "ieq" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "commissionRate", "performance.placementsCompleted", "performance.leadsGenerated"],
    groupable: ["superAgentId", "country", "currencyCode"],
    numeric: [
      "commissionRate", "performance.leadsGenerated", "performance.employersCreated", "performance.vacanciesPosted",
      "performance.jobSeekersSubmitted", "performance.interviewsScheduled", "performance.placementsCompleted",
    ],
  },

  // ── Super agents ───────────────────────────────────────────────────────────
  {
    key: "super-agents",
    label: "Super agents",
    description: "Regional managers who oversee a team of agents and earn override commission.",
    model: m(SuperAgent),
    joinUser: true,
    fields: [
      ID,
      f("userId", "objectId", "Super-agent's user account."),
      USER_JOIN_FIELD,
      f("referralCode", "string", "Public referral code."),
      f("country", "string", "Country of operation."),
      f("currencyCode", "string", "Default currency."),
      count("agentsCount", "agentIds", "Agents in this super-agent's team."),
      count("assignedCitiesCount", "assignedCityIds", "Cities in territory."),
      f("overrideRate", "number", "Override commission % on team placements."),
      f("defaultAgentCommissionRate", "number", "Default commission % for new agents."),
      f("commissions", "object", "Running totals { total, pending, paid }."),
      f("roleArchivedAt", "date", "Set when converted away from the super_agent role."),
      CREATED,
      UPDATED,
    ],
    filters: [filt("country", "string", "Country (case-insensitive exact).", { op: "ieq" })],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "commissions.total"],
    groupable: ["country", "currencyCode"],
    numeric: ["overrideRate", "defaultAgentCommissionRate", "commissions.total", "commissions.pending", "commissions.paid"],
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  {
    key: "jobs",
    label: "Jobs",
    description: "Job postings (soft-deleted jobs are excluded).",
    model: m(Job),
    baseFilter: { deletedAt: null },
    fields: [
      ID,
      f("employerId", "objectId", "Employer that owns the job (see /employers/{id})."),
      f("agentId", "objectId", "Agent handling the job, if any."),
      f("title", "string", "Job title."),
      f("category", "string", "Job category / functional area."),
      f("status", "string", "Lifecycle status.", { enum: JOB_STATUSES }),
      f("employmentType", "string", "full_time | part_time | contract | internship | freelance | walk_in."),
      f("workMode", "string", "onsite | hybrid | remote."),
      f("location", "object", "{ country, city, isRemote, remoteScope, remoteCountries }."),
      f("salary", "object", "{ min, max, currency, period, isNegotiable }. Shown to candidates only if showSalary."),
      f("showSalary", "boolean", "Whether salary is public."),
      f("requirements", "object", "{ skills, preferredSkills, experienceMin, experienceMax, education, languages, nationality }."),
      f("vacancies", "number", "Number of openings."),
      count("applicantsCount", "applicantIds", "Number of applicants."),
      f("views", "number", "Total page views."),
      f("uniqueViews", "number", "Unique viewers."),
      f("tags", "array", "Tags."),
      f("visibility", "string", "public | private | invite_only."),
      f("isFeatured", "boolean", "Promoted listing."),
      f("isWalkIn", "boolean", "Walk-in interview drive."),
      f("workflowMode", "string", "auto | manual candidate pipeline."),
      f("expiresAt", "date", "When the posting expires."),
      f("description", "string", "Full job description.", { detailOnly: true }),
      f("responsibilities", "array", "Responsibilities.", { detailOnly: true }),
      f("benefits", "array", "Benefits.", { detailOnly: true }),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Job status.", { enum: JOB_STATUSES }),
      filt("employerId", "objectId", "Jobs of this employer."),
      filt("agentId", "objectId", "Jobs handled by this agent."),
      filt("country", "string", "location.country (case-insensitive exact).", { path: "location.country", op: "ieq" }),
      filt("city", "string", "location.city (case-insensitive exact).", { path: "location.city", op: "ieq" }),
      filt("employmentType", "string", "Employment type."),
      filt("workMode", "string", "onsite | hybrid | remote."),
      filt("category", "string", "Category (case-insensitive exact).", { op: "ieq" }),
      filt("isFeatured", "boolean", "true/false."),
      filt("visibility", "string", "public | private | invite_only."),
      filt("skill", "string", "Requires this skill (case-insensitive exact).", { path: "requirements.skills", op: "ieq" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "expiresAt", "views", "title"],
    groupable: [
      "status", "employerId", "agentId", "category", "employmentType", "workMode",
      "location.country", "location.city", "visibility", "isFeatured", "requirements.skills", "salary.currency",
    ],
    numeric: ["vacancies", "views", "uniqueViews", "salary.min", "salary.max"],
    searchFields: [{ path: "title" }],
  },

  // ── Applications ───────────────────────────────────────────────────────────
  {
    key: "applications",
    label: "Applications",
    description: "A candidate's application to a job. `status` is the pipeline stage. Private notes and screening answers are never returned.",
    model: m(Application),
    fields: [
      ID,
      f("jobId", "objectId", "Job applied to."),
      f("jobSeekerId", "objectId", "Candidate profile (see /job-seekers/{id})."),
      f("employerId", "objectId", "Employer of the job."),
      f("agentId", "objectId", "Agent handling the candidate, if any."),
      f("status", "string", "Pipeline stage.", { enum: APPLICATION_STATUSES }),
      f("source", "string", "easy_apply | full_form | direct | auto_apply."),
      f("autoApplied", "boolean", "Submitted by the auto-apply engine."),
      f("isAgentReferred", "boolean", "Candidate was agent-referred at apply time."),
      f("aiMatchScore", "number", "Employer-side ATS ranking score 0–100."),
      f("seekerMatchScore", "number", "Candidate-side match score 0–100."),
      f("behaviorScore", "number", "Engagement/behaviour score."),
      f("requirementsStatus", "string", "met | not_met | unverified (hard requirements)."),
      f("matchedSkills", "array", "Job skills the candidate has."),
      f("missingSkills", "array", "Job skills the candidate lacks."),
      f("appliedAt", "date", "When the candidate applied."),
      f("viewedByEmployerAt", "date", "First time the employer opened it."),
      f("rejectionReason", "string", "Reason code/text when rejected."),
      f("withdrawalReason", "string", "Reason when withdrawn by candidate."),
      count("interviewsCount", "interviewIds", "Interviews linked to this application."),
      count("documentsCount", "documents", "Attached documents (files never returned)."),
      f("statusHistory", "array", "[{ status, changedAt }] stage transitions, oldest first.", {
        src: ["statusHistory.status", "statusHistory.changedAt"],
        detailOnly: true,
      }),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Pipeline stage.", { enum: APPLICATION_STATUSES }),
      filt("jobId", "objectId", "Applications to this job."),
      filt("employerId", "objectId", "Applications to this employer's jobs."),
      filt("agentId", "objectId", "Applications handled by this agent."),
      filt("jobSeekerId", "objectId", "Applications by this candidate."),
      filt("source", "string", "easy_apply | full_form | direct | auto_apply."),
      filt("isAgentReferred", "boolean", "true/false."),
      filt("minScore", "number", "aiMatchScore ≥ value.", { path: "aiMatchScore", op: "gte" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "appliedAt", "aiMatchScore"],
    groupable: ["status", "jobId", "employerId", "agentId", "source", "autoApplied", "isAgentReferred", "requirementsStatus", "rejectionReason"],
    numeric: ["aiMatchScore", "seekerMatchScore", "behaviorScore"],
  },

  // ── Interviews ─────────────────────────────────────────────────────────────
  {
    key: "interviews",
    label: "Interviews",
    description: "Scheduled interviews. Meeting links, response tokens and free-text feedback are never returned.",
    model: m(Interview),
    fields: [
      ID,
      f("applicationId", "objectId", "Application being interviewed."),
      f("jobId", "objectId", "Job."),
      f("jobSeekerId", "objectId", "Candidate."),
      f("employerId", "objectId", "Employer."),
      f("agentId", "objectId", "Agent, if any."),
      f("type", "string", "video | offline | hybrid."),
      f("status", "string", "Interview status.", { enum: INTERVIEW_STATUSES }),
      f("outcome", "string", "passed | failed | hold | no_show."),
      f("scheduledAt", "date", "Start time."),
      f("duration", "number", "Duration in minutes."),
      f("interviewRound", "number", "Round number (1 = first)."),
      f("rescheduleCount", "number", "Times rescheduled."),
      f("candidateResponse", "string", "pending | confirmed | declined | reschedule_requested."),
      f("candidateResponseAt", "date", "When the candidate responded."),
      f("reminderSent", "boolean", "Reminder e-mail sent."),
      has("hasMeetLink", "meetLink", "Whether a video link is set (the link is never returned)."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Interview status.", { enum: INTERVIEW_STATUSES }),
      filt("type", "string", "video | offline | hybrid."),
      filt("outcome", "string", "passed | failed | hold | no_show."),
      filt("jobId", "objectId", "Interviews for this job."),
      filt("employerId", "objectId", "Interviews for this employer."),
      filt("agentId", "objectId", "Interviews handled by this agent."),
      filt("applicationId", "objectId", "Interviews for this application."),
      filt("jobSeekerId", "objectId", "Interviews for this candidate."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "scheduledAt"],
    groupable: ["status", "type", "outcome", "candidateResponse", "interviewRound", "employerId", "jobId", "agentId"],
    numeric: ["duration", "interviewRound", "rescheduleCount"],
  },

  // ── Offers ─────────────────────────────────────────────────────────────────
  {
    key: "offers",
    label: "Offers",
    description: "Job offers sent to candidates, including counter-offers.",
    model: m(Offer),
    fields: [
      ID,
      f("applicationId", "objectId", "Application."),
      f("jobId", "objectId", "Job."),
      f("jobSeekerId", "objectId", "Candidate."),
      f("employerId", "objectId", "Employer."),
      f("status", "string", "Offer status.", { enum: OFFER_STATUSES }),
      f("salary", "object", "{ amount, currency, period: monthly|annually }."),
      f("startDate", "date", "Proposed start date."),
      f("expiresAt", "date", "Offer expiry."),
      f("respondedAt", "date", "When the candidate responded."),
      f("declineReason", "string", "Reason when declined."),
      f("revisionNumber", "number", "Revision (1 = original)."),
      f("reminderCount", "number", "Reminders sent."),
      f("viewedAt", "date", "First viewed by candidate."),
      has("hasCounterOffer", "counterOffer.amount", "Candidate made a counter-offer."),
      f("counterOffer", "object", "{ amount, currency, period, proposedAt } when countered.", {
        src: ["counterOffer.amount", "counterOffer.currency", "counterOffer.period", "counterOffer.proposedAt"],
        detailOnly: true,
      }),
      has("isSigned", "signature.signedAt", "Candidate e-signed the offer."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Offer status.", { enum: OFFER_STATUSES }),
      filt("jobId", "objectId", "Offers for this job."),
      filt("employerId", "objectId", "Offers from this employer."),
      filt("jobSeekerId", "objectId", "Offers to this candidate."),
      filt("currency", "string", "salary.currency.", { path: "salary.currency" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "respondedAt", "salary.amount"],
    groupable: ["status", "employerId", "jobId", "salary.currency", "salary.period", "declineReason"],
    numeric: ["salary.amount", "revisionNumber", "reminderCount"],
  },

  // ── Placements ─────────────────────────────────────────────────────────────
  {
    key: "placements",
    label: "Placements",
    description: "Successful hires. `from`/`to` filter on placedAt.",
    model: m(Placement),
    fields: [
      ID,
      f("applicationId", "objectId", "Application that led to the hire."),
      f("jobId", "objectId", "Job."),
      f("jobSeekerId", "objectId", "Hired candidate."),
      f("employerId", "objectId", "Employer."),
      f("agentId", "objectId", "Agent credited."),
      f("superAgentId", "objectId", "Super-agent credited."),
      f("status", "string", "Placement status.", { enum: PLACEMENT_STATUSES }),
      f("placedAt", "date", "Date of placement."),
      f("startDate", "date", "Employment start date."),
      f("salary", "number", "Agreed salary (number)."),
      f("currency", "string", "Salary currency."),
      f("visaStatus", "string", "not_required | pending | approved | rejected | stamped."),
      f("commissionPaid", "boolean", "Commission settled."),
      f("commissionAmount", "number", "Commission amount."),
      has("hasOfferLetter", "offerLetterUrl", "Whether an offer letter file exists (never returned)."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Placement status.", { enum: PLACEMENT_STATUSES }),
      filt("employerId", "objectId", "Placements at this employer."),
      filt("agentId", "objectId", "Placements credited to this agent."),
      filt("superAgentId", "objectId", "Placements credited to this super-agent."),
      filt("jobId", "objectId", "Placements for this job."),
      filt("visaStatus", "string", "Visa status."),
      filt("commissionPaid", "boolean", "true/false."),
      filt("currency", "string", "Salary currency."),
    ],
    dateField: "placedAt",
    sortable: ["placedAt", "createdAt", "startDate", "salary"],
    groupable: ["status", "employerId", "agentId", "superAgentId", "jobId", "visaStatus", "commissionPaid", "currency"],
    numeric: ["salary", "commissionAmount"],
  },

  // ── Commissions ────────────────────────────────────────────────────────────
  {
    key: "commissions",
    label: "Commissions",
    description: "Agent / super-agent commission lines. Amounts are in `currency` — never sum across currencies.",
    model: m(Commission),
    fields: [
      ID,
      f("invoiceId", "objectId", "Invoice that generated it."),
      f("placementId", "objectId", "Placement it pays for."),
      f("agentId", "objectId", "Agent paid."),
      f("superAgentId", "objectId", "Super-agent paid."),
      f("type", "string", "placement | override | bonus."),
      f("amount", "number", "Amount in `currency`."),
      f("currency", "string", "ISO currency."),
      f("rate", "number", "Percentage rate applied."),
      f("status", "string", "Commission status.", { enum: COMMISSION_STATUSES }),
      f("approvedAt", "date", "When approved."),
      f("paidAt", "date", "When paid."),
      f("disputedAt", "date", "When disputed."),
      f("disputeResolution", "string", "resolved | rejected | escalated."),
      f("clawbackAmount", "number", "Amount clawed back."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Commission status.", { enum: COMMISSION_STATUSES }),
      filt("type", "string", "placement | override | bonus."),
      filt("agentId", "objectId", "Commissions of this agent."),
      filt("superAgentId", "objectId", "Commissions of this super-agent."),
      filt("currency", "string", "Currency."),
      filt("placementId", "objectId", "Commissions for this placement."),
      filt("invoiceId", "objectId", "Commissions from this invoice."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "paidAt", "amount"],
    groupable: ["status", "type", "agentId", "superAgentId", "currency"],
    numeric: ["amount", "rate", "clawbackAmount"],
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  {
    key: "invoices",
    label: "Invoices",
    description: "Billing invoices (subscription + recruitment). Money is per `currency`. void/cancelled/refunded/credit_note are not revenue.",
    model: m(Invoice),
    fields: [
      ID,
      f("invoiceNumber", "string", "Human invoice number."),
      f("category", "string", "subscription | recruitment | premium_posting | featured_promotion | exhibition | bulk_hiring | consulting | custom_enterprise."),
      f("type", "string", "new | renewal | upgrade | downgrade | recruitment | …"),
      f("status", "string", "Invoice status.", { enum: INVOICE_STATUSES }),
      f("userId", "objectId", "Billed user account."),
      f("employerId", "objectId", "Billed employer, if any."),
      f("agentId", "objectId", "Agent linked, if any."),
      f("jobId", "objectId", "Job linked (recruitment invoices)."),
      f("subscriptionId", "objectId", "Subscription billed."),
      f("planName", "string", "Plan name at billing time."),
      f("billingCycle", "string", "monthly | quarterly | yearly."),
      f("periodStart", "date", "Billed period start."),
      f("periodEnd", "date", "Billed period end."),
      f("subtotal", "number", "Before discount/tax."),
      f("discountAmount", "number", "Discount."),
      f("taxType", "string", "gst | vat | reverse_charge | none."),
      f("taxPercent", "number", "Tax %."),
      f("taxAmount", "number", "Tax."),
      f("serviceCharge", "number", "Service charge."),
      f("totalAmount", "number", "Grand total."),
      f("currency", "string", "ISO currency."),
      f("platformRevenue", "number", "Platform's share after commissions."),
      f("paidAmount", "number", "Amount received."),
      f("balanceDue", "number", "Outstanding."),
      f("refundedAmount", "number", "Refunded."),
      f("paymentTerms", "string", "immediate | net_7 … net_90 | custom."),
      f("dueDate", "date", "Due date."),
      f("issuedAt", "date", "Issued."),
      f("paidAt", "date", "Fully paid."),
      f("sentAt", "date", "E-mailed to customer."),
      f("reminderCount", "number", "Reminders sent."),
      count("lineItemsCount", "lineItems", "Number of line items."),
      count("paymentsCount", "payments", "Number of payments recorded."),
      f("billingCompanyName", "string", "Billed company name.", { src: ["billingDetails.companyName"], compute: (d) => getPath(d, "billingDetails.companyName") ?? null }),
      f("billingCountry", "string", "Billed country.", { src: ["billingDetails.country"], compute: (d) => getPath(d, "billingDetails.country") ?? null }),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Invoice status.", { enum: INVOICE_STATUSES }),
      filt("category", "string", "Invoice category."),
      filt("type", "string", "Invoice type."),
      filt("currency", "string", "Currency."),
      filt("employerId", "objectId", "Invoices for this employer."),
      filt("agentId", "objectId", "Invoices linked to this agent."),
      filt("userId", "objectId", "Invoices billed to this user."),
      filt("subscriptionId", "objectId", "Invoices for this subscription."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "issuedAt", "paidAt", "dueDate", "totalAmount"],
    groupable: ["status", "category", "type", "currency", "billingCycle", "planName", "employerId", "agentId", "paymentTerms", "taxType"],
    numeric: ["totalAmount", "subtotal", "taxAmount", "discountAmount", "paidAmount", "balanceDue", "platformRevenue", "refundedAmount"],
    searchFields: [{ path: "invoiceNumber" }],
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────
  {
    key: "subscriptions",
    label: "Subscriptions",
    description: "Plan subscriptions of employers and job seekers. `mrr` normalises price to a monthly amount.",
    model: m(Subscription),
    fields: [
      ID,
      f("userId", "objectId", "Subscriber user account."),
      f("targetRole", "string", "employer | job_seeker."),
      f("planId", "objectId", "Plan."),
      f("planName", "string", "Plan name at subscription time.", { src: ["planSnapshot.name"], compute: (d) => getPath(d, "planSnapshot.name") ?? null }),
      f("planTier", "number", "Plan tier (higher = more expensive).", { src: ["planSnapshot.tier"], compute: (d) => getPath(d, "planSnapshot.tier") ?? null }),
      f("price", "number", "Plan price per billing cycle.", { src: ["planSnapshot.price"], compute: (d) => getPath(d, "planSnapshot.price") ?? 0 }),
      f("currency", "string", "Price currency.", { src: ["planSnapshot.currency"], compute: (d) => getPath(d, "planSnapshot.currency") ?? null }),
      f("billingCycle", "string", "monthly | quarterly | yearly.", { src: ["planSnapshot.billingCycle"], compute: (d) => getPath(d, "planSnapshot.billingCycle") ?? null }),
      f("mrr", "number", "Monthly recurring revenue of this subscription (price ÷ months in cycle).", {
        src: ["planSnapshot.price", "planSnapshot.billingCycle"],
        compute: (d) => mrrOf(getPath(d, "planSnapshot.price") as number, getPath(d, "planSnapshot.billingCycle") as string),
      }),
      f("status", "string", "Subscription status.", { enum: SUBSCRIPTION_STATUSES }),
      f("startDate", "date", "Start."),
      f("endDate", "date", "End / renewal date."),
      f("autoRenew", "boolean", "Auto-renews."),
      f("usage", "object", "Feature usage counters for the current period.", { detailOnly: true }),
      f("assignedByRole", "string", "Role that assigned it (admin, self, …)."),
      f("cancelledAt", "date", "When cancelled."),
      f("cancellationReason", "string", "Why cancelled."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Subscription status.", { enum: SUBSCRIPTION_STATUSES }),
      filt("targetRole", "string", "employer | job_seeker."),
      filt("planId", "objectId", "Subscriptions on this plan."),
      filt("userId", "objectId", "Subscriptions of this user."),
      filt("autoRenew", "boolean", "true/false."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "startDate", "endDate"],
    groupable: ["status", "targetRole", "planId", "planSnapshot.name", "planSnapshot.billingCycle", "planSnapshot.currency", "autoRenew", "assignedByRole"],
    numeric: ["planSnapshot.price", "planSnapshot.tier"],
  },

  // ── Leads ──────────────────────────────────────────────────────────────────
  {
    key: "leads",
    label: "Leads",
    description: "Sales leads (prospective employers) worked by agents. Contact details are PII.",
    model: m(Lead),
    fields: [
      ID,
      f("agentId", "objectId", "Agent working the lead."),
      f("superAgentId", "objectId", "Super-agent."),
      f("companyName", "string", "Prospect company."),
      f("contactPerson", "string", "Contact name.", { pii: "name" }),
      f("contactEmail", "string", "Contact e-mail.", { pii: "email" }),
      f("contactPhone", "string", "Contact phone.", { pii: "phone" }),
      f("country", "string", "Country."),
      f("city", "string", "City."),
      f("industry", "string", "Industry."),
      f("score", "number", "Lead score 0–100."),
      f("qualificationLevel", "string", "cold | warm | hot | qualified."),
      f("expectedRevenue", "number", "Expected deal value."),
      f("expectedRevenueCurrency", "string", "Currency of expectedRevenue."),
      f("status", "string", "Lead status (legacy rows may be UPPERCASE; filter is case-insensitive).", { enum: LEAD_STATUSES }),
      f("lostReason", "string", "Why lost."),
      f("source", "string", "Lead source (free text)."),
      f("followUpAt", "date", "Next follow-up."),
      f("convertedAt", "date", "When converted to an employer."),
      f("convertedToEmployerId", "objectId", "Resulting employer."),
      f("autoRouted", "boolean", "Assigned by territory auto-routing."),
      f("exhibitionId", "objectId", "Exhibition it came from."),
      count("activityCount", "activityLog", "Number of logged activities."),
      CREATED,
      UPDATED,
    ],
    filters: [
      filt("status", "string", "Lead status (case-insensitive).", { op: "ieq", enum: LEAD_STATUSES }),
      filt("agentId", "objectId", "Leads of this agent."),
      filt("superAgentId", "objectId", "Leads of this super-agent."),
      filt("country", "string", "Country (case-insensitive exact).", { op: "ieq" }),
      filt("source", "string", "Source (case-insensitive exact).", { op: "ieq" }),
      filt("qualificationLevel", "string", "cold | warm | hot | qualified."),
      filt("industry", "string", "Industry (case-insensitive exact).", { op: "ieq" }),
    ],
    dateField: "createdAt",
    sortable: ["createdAt", "updatedAt", "score", "expectedRevenue", "convertedAt"],
    groupable: ["status", "agentId", "superAgentId", "country", "source", "qualificationLevel", "industry", "autoRouted"],
    numeric: ["score", "expectedRevenue"],
    searchFields: [{ path: "companyName" }],
  },

  // ── Audit logs ─────────────────────────────────────────────────────────────
  {
    key: "audit-logs",
    label: "Audit logs",
    description: "Who did what and when. meta/changes are sanitized (secrets removed; PII masked without pii:read).",
    model: m(AuditLog),
    fields: [
      ID,
      f("actorId", "objectId", "User who acted (absent for system events)."),
      f("actorRole", "string", "Role of the actor (or system / api_key)."),
      f("onBehalfOfId", "objectId", "Account acted against (tenant view / impersonation)."),
      f("onBehalfOfRole", "string", "Role of that account."),
      f("action", "string", "Action verb, e.g. job.create, application.status_change, insights.read."),
      f("resource", "string", "Resource type."),
      f("resourceId", "string", "Affected record id."),
      f("ipAddress", "string", "Client IP.", { pii: "ip" }),
      f("country", "string", "Client country (ISO-2) from CDN headers."),
      f("userAgent", "string", "Client user agent.", { pii: "text", detailOnly: true }),
      f("meta", "object", "Free-form context (sanitized).", { detailOnly: true }),
      f("changes", "object", "{ before, after } snapshot (sanitized).", { detailOnly: true }),
      CREATED,
    ],
    filters: [
      filt("action", "string", "Exact action."),
      filt("actionPrefix", "string", "Action starts with, e.g. `application.`.", { path: "action", op: "prefix" }),
      filt("resource", "string", "Resource type."),
      filt("resourceId", "string", "Affected record id."),
      filt("actorId", "objectId", "Actions by this user."),
      filt("actorRole", "string", "Actions by this role."),
      filt("country", "string", "Client country (ISO-2)."),
    ],
    dateField: "createdAt",
    sortable: ["createdAt"],
    groupable: ["action", "resource", "actorRole", "actorId", "country"],
    numeric: [],
  },
];

const BY_KEY = new Map(ENTITIES.map((e) => [e.key, e]));

/** Accepts the URL key ("job-seekers") or snake/camel variants ("job_seekers"). */
export function getEntity(key: string | undefined | null): EntityDef | undefined {
  if (!key) return undefined;
  const normalized = key.trim().toLowerCase().replace(/_/g, "-");
  return BY_KEY.get(normalized);
}

export const ENTITY_KEYS = ENTITIES.map((e) => e.key);
