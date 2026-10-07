import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CustomPermissions, PermissionMode, UserRole } from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";
import { canAccess } from "@/lib/permissions/matrix";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { DASHBOARD_PERIODS, resolveDashboardPeriod, type DashboardPeriod } from "@/lib/admin/dashboard/period";
import { describePeriod } from "@/lib/mcp/reports/period";
import { sanitizeReport } from "@/lib/mcp/reports/privacy";
import { buildAdminReport } from "@/lib/mcp/reports/admin";
import { buildSuperAgentReport } from "@/lib/mcp/reports/superAgent";
import { buildAgentReport } from "@/lib/mcp/reports/agent";
import { buildEmployerReport } from "@/lib/mcp/reports/employer";
import { buildJobSeekerReport } from "@/lib/mcp/reports/jobSeeker";

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

const REPORT_SCOPE: McpScope = "read:reports";

/** Roles whose report spans other people's work, so the permission matrix's reports:read applies. */
const STAFF_ROLES: ReadonlySet<UserRole> = new Set(["admin", "super_agent", "agent"]);

const PRIVACY_NOTE =
  "Aggregated numbers only: no names of people or companies, no email addresses, phone numbers, ids or money figures. Job titles are the only names included.";

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

/** Token scope + live permission check; the report builders do the data scoping. */
function authorize(auth: AuthInfo | undefined) {
  const extra = auth?.extra as TokenExtra | undefined;
  if (!extra) return { ok: false as const, error: errorResult("Unauthorized", REPORT_SCOPE) };
  if (!auth!.scopes.includes(REPORT_SCOPE)) {
    return { ok: false as const, error: errorResult(`Forbidden — missing scope "${REPORT_SCOPE}"`, REPORT_SCOPE) };
  }
  if (
    STAFF_ROLES.has(extra.role) &&
    !canAccess(extra.role, "reports", "read", {
      permissionMode: extra.permissionMode,
      customPermissions: extra.customPermissions,
    })
  ) {
    return {
      ok: false as const,
      error: errorResult("Forbidden — your current account permissions do not include reports"),
    };
  }
  return { ok: true as const, ...extra };
}

/** One report per role, each limited to what that role already sees in Mployedin. */
async function buildReport(auth: TokenExtra, period: DashboardPeriod): Promise<unknown | null> {
  const { role, userId } = auth;
  switch (role) {
    case "admin":
      return buildAdminReport(period, (resource) =>
        canAccess(role, resource, "read", {
          permissionMode: auth.permissionMode,
          customPermissions: auth.customPermissions,
        }),
      );
    case "super_agent":
      return buildSuperAgentReport(userId);
    case "agent":
      return buildAgentReport(userId, period);
    case "employer":
      return buildEmployerReport(userId, period);
    case "job_seeker":
      return buildJobSeekerReport(userId, period);
    default:
      // Default-deny: a role this switch doesn't know gets nothing.
      return null;
  }
}

/** Register the reports-only, read-only MCP tool surface. */
export function registerMcpTools(server: McpServer) {
  server.registerTool(
    "get_summary_report",
    {
      title: "Get summary report",
      description:
        "Use this when the signed-in user wants analytics about their Mployedin activity: totals, breakdowns by status " +
        "and trends compared with the previous period. The report covers only what the user's role can see " +
        "(admin: whole platform; super agent: their territory; agent: their own work; employer: their company; " +
        `job seeker: their own job search). ${PRIVACY_NOTE}`,
      inputSchema: {
        period: z
          .enum(DASHBOARD_PERIODS)
          .optional()
          .describe("Length of the period to report on, compared with the period before it. Defaults to 30d."),
      },
      outputSchema: RESULT_SCHEMA,
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: oauthMeta(REPORT_SCOPE),
    },
    async (args, extra) => {
      const auth = authorize(extra.authInfo);
      if (!auth.ok) return auth.error;

      const period = resolveDashboardPeriod(args.period);
      try {
        await connectDB();
        const report = await buildReport(auth, period);
        if (!report) return errorResult("No report is available for this account yet.");
        return jsonResult(
          sanitizeReport({
            role: auth.role,
            period: describePeriod(period),
            generatedAt: period.now,
            privacy: PRIVACY_NOTE,
            report,
          }),
        );
      } catch (err) {
        logger.error({ err, role: auth.role }, "[mcp] summary report failed");
        return errorResult("The report could not be built right now. Try again later.");
      }
    },
  );
}
