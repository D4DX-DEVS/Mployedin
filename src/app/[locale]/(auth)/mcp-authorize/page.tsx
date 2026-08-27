import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import McpClient from "@/models/McpClient";
import { scopesForRole, type McpScope } from "@/lib/mcp/scopes";
import { ConsentForm } from "./ConsentForm";
import type { UserRole } from "@/types/user";

const SCOPE_TRANSLATION_KEY: Record<McpScope, string> = {
  "read:jobs": "scopeReadJobs",
  "read:applications": "scopeReadApplications",
  "read:profile": "scopeReadProfile",
  "read:employer_jobs": "scopeReadEmployerJobs",
  "read:applicants": "scopeReadApplicants",
};

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
  const role = (session?.user as unknown as { role?: UserRole } | undefined)?.role;

  const clientId = sp.client_id ?? "";
  const redirectUri = sp.redirect_uri ?? "";
  const codeChallenge = sp.code_challenge ?? "";
  const requestedScope = sp.scope ?? "";
  const state = sp.state ?? "";

  await connectDB();
  const client = clientId ? await McpClient.findOne({ clientId }).lean() : null;
  const valid = Boolean(session?.user && role && client && client.redirectUris.includes(redirectUri) && codeChallenge);

  if (!valid || !client || !role) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">{t("invalidRequest")}</p>
      </div>
    );
  }

  const grantedScopes = scopesForRole(requestedScope.split(" ").filter(Boolean), role);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-xl font-semibold text-foreground">{t("title", { clientName: client.clientName })}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("subtitle", { clientName: client.clientName })}</p>

      {grantedScopes.length > 0 ? (
        <ul className="mt-4 space-y-2 rounded-lg border border-border/60 bg-muted/30 card-pad">
          {grantedScopes.map((scope) => (
            <li key={scope} className="text-sm text-foreground">
              • {t(SCOPE_TRANSLATION_KEY[scope])}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-destructive">{t("noScopes")}</p>
      )}

      <ConsentForm
        clientId={clientId}
        redirectUri={redirectUri}
        codeChallenge={codeChallenge}
        scope={grantedScopes.join(" ")}
        state={state}
      />
    </div>
  );
}
