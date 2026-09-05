import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  Action,
  CustomPermissions,
  PermissionMode,
  Resource,
  UserRole,
} from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";
import { canAccess } from "@/lib/permissions/matrix";
import { callRoute } from "@/lib/mcp/callRoute";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { getHandler as jobsGetHandler } from "@/app/api/jobs/handlers";
import { getHandler as managedJobsGetHandler } from "@/app/api/admin/jobs/handlers";
import { getHandler as jobGetByIdHandler } from "@/app/api/jobs/[id]/handlers";
import { getHandler as recommendedJobsGetHandler } from "@/app/api/jobs/recommended/handlers";
import { applicationsGetHandler } from "@/app/api/applications/handlers";
import { getHandler as jobSeekerProfileGetHandler } from "@/app/api/job-seeker/profile/handlers";

interface TokenExtra {
  userId: string;
  role: UserRole;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const RESULT_SCHEMA = { data: z.unknown() };

function oauthMeta(scope: McpScope) {
  // SDK 1.26 exposes vendor auth metadata through `_meta`. Keep this alongside
  // RFC 9728 resource metadata so ChatGPT can present the correct linking UI.
  return { securitySchemes: [{ type: "oauth2", scopes: [scope] }] };
}

function errorResult(text: string, scope?: McpScope) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
    ...(scope
      ? {
          _meta: {
            "mcp/www_authenticate":
              `Bearer resource_metadata="${getMcpResourceUrl()}/.well-known/oauth-protected-resource", ` +
              `error="insufficient_scope", error_description="The ${scope} scope is required"`,
          },
        }
      : {}),
  };
}

function jsonResult(body: unknown) {
  return {
    structuredContent: { data: body },
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function minimizeJob(value: unknown): unknown {
  const job = asRecord(value);
  if (!job) return value;
  const employer = asRecord(job.employerId);
  const agent = asRecord(job.agentId);
  const agentUser = asRecord(agent?.userId);
  const allowed = [
    "_id",
    "title",
    "description",
    "category",
    "location",
    "requirements",
    "salary",
    "employmentType",
    "workMode",
    "status",
    "createdAt",
    "expiresAt",
    "tags",
    "vacancies",
    "showSalary",
    "applicationMode",
    "matchScore",
    "matchedSkills",
    "applicantsCount",
    "applicationCount",
  ];
  return {
    ...Object.fromEntries(allowed.filter((key) => key in job).map((key) => [key, job[key]])),
    ...(employer
      ? {
          employerId: {
            _id: employer._id,
            companyName: employer.companyName,
            country: employer.country,
            industry: employer.industry,
            logo: employer.logo,
            verificationLevel: employer.verificationLevel,
          },
        }
      : { employerId: job.employerId }),
    ...(agent
      ? {
          agentId: {
            _id: agent._id,
            name: agentUser?.name,
          },
        }
      : {}),
  };
}

function minimizeJobList(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    ...(Array.isArray(body.jobs) ? { jobs: body.jobs.map(minimizeJob) } : {}),
  };
}

/** Remove contact documents and internal workflow fields from applicant list results. */
function minimizeApplicantList(body: Record<string, unknown>): Record<string, unknown> {
  const applications = Array.isArray(body.applications)
    ? body.applications.map((value) => {
        const app = asRecord(value);
        if (!app) return value;
        const seeker = asRecord(app.jobSeekerId);
        const seekerUser = asRecord(seeker?.userId);
        return {
          _id: app._id,
          status: app.status,
          appliedAt: app.appliedAt ?? app.createdAt,
          source: app.source,
          aiMatchScore: app.aiMatchScore ?? app.matchScore,
          jobId: minimizeJob(app.jobId),
          jobSeekerId: seeker
            ? {
                _id: seeker._id,
                fullName: seeker.fullName ?? seekerUser?.name,
                skills: seeker.skills,
                currentLocation: seeker.currentLocation,
                totalExperienceYears: seeker.totalExperienceYears,
                availabilityStatus: seeker.availabilityStatus,
                profileCompleteness: seeker.profileCompleteness,
              }
            : app.jobSeekerId,
          latestInterview: app.latestInterview,
          latestOffer: app.latestOffer,
          placement: app.placement,
        };
      })
    : [];

  return {
    applications,
    pagination: body.pagination,
  };
}

function minimizeProfile(body: Record<string, unknown>): Record<string, unknown> {
  const allowed = [
    "fullName",
    "summary",
    "skills",
    "experience",
    "education",
    "languages",
    "certifications",
    "currentLocation",
    "nationality",
    "preferredCountries",
    "preferredRoles",
    "preferredLocations",
    "preferredSalary",
    "preferredJobType",
    "availabilityStatus",
    "profileCompleteness",
    "linkedin",
    "socialLinks",
  ];
  return Object.fromEntries(allowed.filter((key) => key in body).map((key) => [key, body[key]]));
}

/**
 * Resolve the current caller and enforce token scope, role, and the platform's
 * live custom-permission matrix. Database ownership/team scoping remains in
 * the reused route handler as a second authorization layer.
 */
function authorize(
  auth: AuthInfo | undefined,
  requiredRoles: UserRole[],
  requiredScope: McpScope,
  resource: Resource,
  action: Action = "read",
) {
  const extra = auth?.extra as TokenExtra | undefined;
  if (!extra) return { ok: false as const, error: errorResult("Unauthorized", requiredScope) };
  if (!requiredRoles.includes(extra.role)) {
    return {
      ok: false as const,
      error: errorResult(`Forbidden — this tool is not available to the ${extra.role} role`),
    };
  }
  if (!auth!.scopes.includes(requiredScope)) {
    return {
      ok: false as const,
      error: errorResult(`Forbidden — missing scope "${requiredScope}"`, requiredScope),
    };
  }
  if (!canAccess(extra.role, resource, action, {
    permissionMode: extra.permissionMode,
    customPermissions: extra.customPermissions,
  })) {
    return {
      ok: false as const,
      error: errorResult("Forbidden — your current account permissions do not allow this action"),
    };
  }
  return { ok: true as const, ...extra };
}

/** Register the read-only, role-scoped MCP tool surface. */
export function registerMcpTools(server: McpServer) {
  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs",
      description: "Use this when a signed-in job seeker wants to search active Mployedin job postings.",
      inputSchema: {
        search: z.string().max(500).optional(),
        category: z.string().max(200).optional(),
        location: z.string().max(200).optional(),
        workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
        remote: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:jobs"),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, ["job_seeker"], "read:jobs", "jobs");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(
        jobsGetHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        {
          path: "/api/jobs",
          query: { ...args, remote: args.remote ? "true" : undefined },
        },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeJobList(body));
    },
  );

  server.registerTool(
    "get_job_details",
    {
      title: "Get job details",
      description: "Use this when a signed-in job seeker needs full details for one active job returned by Mployedin.",
      inputSchema: { jobId: z.string().regex(/^[a-f\d]{24}$/i, "jobId must be a MongoDB ObjectId") },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:jobs"),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, ["job_seeker"], "read:jobs", "jobs");
      if (!auth.ok) return auth.error;
      const { ok, status, body } = await callRoute(
        jobGetByIdHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        { path: `/api/jobs/${args.jobId}`, params: { id: args.jobId } },
      );
      if (!ok) return errorResult(status === 404 ? "Job not found" : JSON.stringify(body));
      return jsonResult({
        ...body,
        ...(body.job ? { job: minimizeJob(body.job) } : {}),
      });
    },
  );

  server.registerTool(
    "get_recommended_jobs",
    {
      title: "Get recommended jobs",
      description: "Use this when a signed-in job seeker wants jobs ranked against their current Mployedin profile.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional(),
        sort: z.enum(["match", "latest", "salary"]).optional(),
        min_score: z.number().min(0).max(100).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:jobs"),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, ["job_seeker"], "read:jobs", "jobs");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(
        recommendedJobsGetHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        {
          path: "/api/jobs/recommended",
          query: { limit: args.limit, sort: args.sort, min_score: args.min_score },
        },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeJobList(body));
    },
  );

  server.registerTool(
    "list_my_applications",
    {
      title: "List my applications",
      description: "Use this when a signed-in job seeker wants to review only their own applications and statuses.",
      inputSchema: {
        status: z.string().max(50).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:applications"),
    },
    async (args, extra) => {
      const auth = authorize(
        extra.authInfo,
        ["job_seeker"],
        "read:applications",
        "applications",
      );
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(
        applicationsGetHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        { path: "/api/applications", query: { ...args } },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeApplicantList(body));
    },
  );

  server.registerTool(
    "get_my_profile",
    {
      title: "Get my job seeker profile",
      description: "Use this when a signed-in job seeker wants to review their own Mployedin profile.",
      inputSchema: {},
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:profile"),
    },
    async (_args, extra) => {
      const auth = authorize(extra.authInfo, ["job_seeker"], "read:profile", "job_seekers");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(
        jobSeekerProfileGetHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        { path: "/api/job-seeker/profile" },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeProfile(body));
    },
  );

  server.registerTool(
    "list_my_job_postings",
    {
      title: "List accessible job postings",
      description: "Use this when an employer, agent, super agent, or admin wants job postings within their current role and team scope.",
      inputSchema: {
        status: z.enum(["active", "draft", "closed", "expired", "paused"]).optional(),
        search: z.string().max(500).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:employer_jobs"),
    },
    async (args, extra) => {
      const auth = authorize(
        extra.authInfo,
        ["employer", "agent", "super_agent", "admin"],
        "read:employer_jobs",
        "jobs",
      );
      if (!auth.ok) return auth.error;

      const useOversightHandler = auth.role === "admin" || auth.role === "super_agent";
      const handler = useOversightHandler ? managedJobsGetHandler : jobsGetHandler;
      const path = useOversightHandler ? "/api/admin/jobs" : "/api/jobs";
      const { ok, body } = await callRoute(
        handler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        {
          path,
          query: {
            ...args,
            myJobs: auth.role === "employer" ? "true" : undefined,
          },
        },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeJobList(body));
    },
  );

  server.registerTool(
    "list_applicants",
    {
      title: "List accessible applicants",
      description: "Use this when an employer, agent, super agent, or admin wants applicants limited to their current role, company, team, and job access.",
      inputSchema: {
        jobId: z.string().regex(/^[a-f\d]{24}$/i, "jobId must be a MongoDB ObjectId").optional(),
        status: z.string().max(50).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta("read:applicants"),
    },
    async (args, extra) => {
      const auth = authorize(
        extra.authInfo,
        ["employer", "agent", "super_agent", "admin"],
        "read:applicants",
        "applications",
      );
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(
        applicationsGetHandler,
        { userId: auth.userId, role: auth.role, locale: "en" },
        { path: "/api/applications", query: { ...args } },
      );
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(minimizeApplicantList(body));
    },
  );
}
