import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import McpClient from "@/models/McpClient";
import { scopesForRole, type McpScope } from "@/lib/mcp/scopes";
import { isAllowedMcpRedirectUri, mcpRedirectHost } from "@/lib/mcp/oauth";
import { getMcpResourceUrl } from "@/lib/mcp/baseUrl";
import { ConsentForm } from "./ConsentForm";
import type { UserRole } from "@/types/user";

const SCOPE_TRANSLATION_KEY: Record<McpScope, string> = {
  "read:jobs": "scopeReadJobs",
  "read:applications": "scopeReadApplications",
  "read:profile": "scopeReadProfile",
  "read:employer_jobs": "scopeReadEmployerJobs",
  "read:applicants": "scopeReadApplicants",
};

interface ConsentSessionUser {
  id?: string;
  email?: string | null;
  role?: UserRole;
  companyOwnerUserId?: string;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-sm font-normal text-muted-foreground">{children}</h1>
    </div>
  );
}

/**
 * /mcp-authorize — consent screen for the MCP (ChatGPT connector) OAuth flow.
 * Reached only after /api/mcp/authorize has already verified the client +
 * redirect_uri and confirmed the caller has a full (non-2FA-pending) session;
 * middleware itself also gates this page behind login like any other
 * authenticated route.
 */
export default async function McpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("mcpAuthorize");
  const session = await auth();
  const user = session?.user as ConsentSessionUser | undefined;
  const role = user?.role;

  const clientId = sp.client_id ?? "";
  const redirectUri = sp.redirect_uri ?? "";
  const codeChallenge = sp.code_challenge ?? "";
  const resource = sp.resource ?? "";
  const requestedScope = sp.scope ?? "";
  const state = sp.state ?? "";

  await connectDB();
  const client = clientId ? await McpClient.findOne({ clientId }).lean() : null;
  const valid = Boolean(
    user && role && client && client.redirectUris.includes(redirectUri) && codeChallenge &&
    resource === getMcpResourceUrl() && isAllowedMcpRedirectUri(redirectUri),
  );
  const redirectHost = mcpRedirectHost(redirectUri);

  if (!valid || !client || !role || !redirectHost) {
    return <Notice>{t("invalidRequest")}</Notice>;
  }

  // An employer's colleague holds the owner's workspace, not their own; the
  // consent API refuses them, so say so here instead of offering Allow.
  const isTeamMember = role === "employer" && Boolean(user?.companyOwnerUserId) && user?.companyOwnerUserId !== user?.id;
  if (isTeamMember) {
    return <Notice>{t("teamMemberBlocked")}</Notice>;
  }

  const grantedScopes = scopesForRole(requestedScope.split(" ").filter(Boolean), role);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-xl font-semibold text-foreground">{t("title", { clientName: client.clientName })}</h1>
      {user?.email && (
        <p className="mt-1 text-sm text-muted-foreground">{t("signedInAs", { email: user.email })}</p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">{t("subtitle", { clientName: client.clientName })}</p>

      {grantedScopes.length > 0 ? (
        <ul className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/30 card-pad">
          {grantedScopes.map((scope) => (
            <li key={scope} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t(SCOPE_TRANSLATION_KEY[scope])}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-destructive">{t("noScopes")}</p>
      )}

      <p className="mt-3 text-sm text-muted-foreground">{t("readOnlyNote")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("returnTo", { host: redirectHost })}</p>

      <ConsentForm
        clientId={clientId}
        redirectUri={redirectUri}
        codeChallenge={codeChallenge}
        resource={resource}
        scope={grantedScopes.join(" ")}
        state={state}
      />
    </div>
  );
}
