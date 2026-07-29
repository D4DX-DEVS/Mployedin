"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Loader2 } from "lucide-react";

export function ConsentForm({
  clientId,
  redirectUri,
  codeChallenge,
  resource,
  scope,
  state,
}: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  state: string;
}) {
  const t = useTranslations("mcpAuthorize");
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState("");

  async function submit(decision: "approve" | "deny") {
    setLoading(decision);
    setError("");
    try {
      const res = await csrfFetch("/api/mcp/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          resource,
          scope,
          state,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectTo) {
        setError(data.error_description ?? t("error"));
        setLoading(null);
        return;
      }
      window.location.href = data.redirectTo;
    } catch {
      setError(t("error"));
      setLoading(null);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => submit("deny")} disabled={loading !== null}>
          {loading === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("deny")}
        </Button>
        <Button className="flex-1" onClick={() => submit("approve")} disabled={loading !== null || !scope}>
          {loading === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("allow")}
        </Button>
      </div>
    </div>
  );
}
