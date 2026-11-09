import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CustomPermissions, PermissionMode, UserRole } from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";
import { getMcpResourceMetadataUrl } from "@/lib/mcp/baseUrl";

/** What an MCP access token carries about its user (set by the token verifier). */
export interface TokenExtra {
  userId: string;
  role: UserRole;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
}

export function oauthMeta(scope: McpScope) {
  // SDK 1.26+ exposes vendor auth metadata through `_meta`. Keep this alongside
  // RFC 9728 resource metadata so ChatGPT can present the correct linking UI.
  return { securitySchemes: [{ type: "oauth2", scopes: [scope] }] };
}

export function errorResult(text: string, scope?: McpScope) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
    ...(scope
      ? {
          _meta: {
            "mcp/www_authenticate":
              `Bearer resource_metadata="${getMcpResourceMetadataUrl()}", ` +
              `error="insufficient_scope", error_description="The ${scope} scope is required"`,
          },
        }
      : {}),
  };
}

export function jsonResult(body: unknown) {
  return {
    structuredContent: { data: body },
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
  };
}

export type ScopeCheck =
  | ({ ok: true } & TokenExtra)
  | { ok: false; error: ReturnType<typeof errorResult> };

/**
 * The token must be present and hold `scope`. An older token without a newer
 * scope gets an insufficient_scope answer, which tells the client to sign in again.
 */
export function requireScope(auth: AuthInfo | undefined, scope: McpScope): ScopeCheck {
  const extra = auth?.extra as TokenExtra | undefined;
  if (!extra) return { ok: false, error: errorResult("Unauthorized", scope) };
  if (!auth!.scopes.includes(scope)) {
    return {
      ok: false,
      error: errorResult(
        `Forbidden — missing scope "${scope}". Reconnect the Mployedin app to grant the new permission.`,
        scope,
      ),
    };
  }
  return { ok: true, ...extra };
}
