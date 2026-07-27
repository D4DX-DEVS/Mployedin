import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { UserRole } from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";
import { callRoute } from "@/lib/mcp/callRoute";
import { getHandler as jobsGetHandler } from "@/app/api/jobs/handlers";
import { getHandler as jobGetByIdHandler } from "@/app/api/jobs/[id]/handlers";
import { getHandler as recommendedJobsGetHandler } from "@/app/api/jobs/recommended/handlers";
import { applicationsGetHandler } from "@/app/api/applications/handlers";
import { getHandler as jobSeekerProfileGetHandler } from "@/app/api/job-seeker/profile/handlers";

interface TokenExtra {
  userId: string;
  role: UserRole;
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function jsonResult(body: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
}

/** Resolves + role/scope-checks the caller for one tool call. Belt-and-suspenders alongside the role-specific tool set below — a stolen/misused token still can't cross roles or scopes. */
function authorize(auth: AuthInfo | undefined, requiredRole: UserRole, requiredScope: McpScope) {
  const extra = auth?.extra as TokenExtra | undefined;
  if (!extra) return { ok: false as const, error: errorResult("Unauthorized") };
  if (extra.role !== requiredRole) {
    return { ok: false as const, error: errorResult(`Forbidden — this tool requires a ${requiredRole} account`) };
  }
  if (!auth!.scopes.includes(requiredScope)) {
    return { ok: false as const, error: errorResult(`Forbidden — missing scope "${requiredScope}"`) };
  }
  return { ok: true as const, userId: extra.userId, role: extra.role };
}

/** Registers the read-only MVP tool set. Called once per MCP request by createMcpHandler's initializeServer callback. */
export function registerMcpTools(server: McpServer) {
  server.tool(
    "search_jobs",
    "Search active job postings on Mployedin (job seeker accounts only)",
    {
      search: z.string().max(500).optional(),
      category: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
      workMode: z.string().optional(),
      remote: z.boolean().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "job_seeker", "read:jobs");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(jobsGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/jobs",
        query: { ...args, remote: args.remote ? "true" : undefined },
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "get_job_details",
    "Get full details for a single active job posting by its ID (job seeker accounts only)",
    { jobId: z.string().min(1) },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "job_seeker", "read:jobs");
      if (!auth.ok) return auth.error;
      const { ok, status, body } = await callRoute(jobGetByIdHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: `/api/jobs/${args.jobId}`,
        params: { id: args.jobId },
      });
      if (!ok) return errorResult(status === 404 ? "Job not found" : JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "get_recommended_jobs",
    "Get jobs matched to the signed-in job seeker's profile, ranked by fit score",
    {
      limit: z.number().int().min(1).max(20).optional(),
      sort: z.enum(["match", "latest", "salary"]).optional(),
      min_score: z.number().min(0).max(100).optional(),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "job_seeker", "read:jobs");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(recommendedJobsGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/jobs/recommended",
        query: { limit: args.limit, sort: args.sort, min_score: args.min_score },
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "list_my_applications",
    "List the signed-in job seeker's own job applications and their status",
    {
      status: z.string().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "job_seeker", "read:applications");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(applicationsGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/applications",
        query: { ...args },
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "get_my_profile",
    "Get the signed-in job seeker's own profile",
    {},
    async (_args, extra) => {
      const auth = authorize(extra.authInfo, "job_seeker", "read:profile");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(jobSeekerProfileGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/job-seeker/profile",
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "list_my_job_postings",
    "List the signed-in employer's own job postings (employer accounts only)",
    {
      status: z.string().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "employer", "read:employer_jobs");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(jobsGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/jobs",
        query: { ...args, myJobs: "true" },
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );

  server.tool(
    "list_applicants",
    "List applicants to the signed-in employer's job postings (employer accounts only)",
    {
      jobId: z.string().optional(),
      status: z.string().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo, "employer", "read:applicants");
      if (!auth.ok) return auth.error;
      const { ok, body } = await callRoute(applicationsGetHandler, { userId: auth.userId, role: auth.role, locale: "en" }, {
        path: "/api/applications",
        query: { ...args },
      });
      if (!ok) return errorResult(JSON.stringify(body));
      return jsonResult(body);
    }
  );
}
