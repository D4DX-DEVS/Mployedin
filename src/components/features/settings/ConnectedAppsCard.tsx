"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, PlugZap, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDate } from "@/lib/ui/intlFormat";
import type { ConnectedApp } from "@/lib/mcp/connectedApps";

type Phase = "loading" | "error" | "ready";

const SCOPE_KEY: Record<string, string> = {
  "read:jobs": "scopeReadJobs",
  "read:applications": "scopeReadApplications",
  "read:profile": "scopeReadProfile",
  "read:employer_jobs": "scopeReadEmployerJobs",
  "read:applicants": "scopeReadApplicants",
};

/**
 * AI apps (ChatGPT, Claude, …) the user approved through the MCP consent
 * screen. Read-only grants; Disconnect revokes the grant immediately.
 */
export function ConnectedAppsCard() {
  const t = useTranslations("connectedApps");
  const tScope = useTranslations("mcpAuthorize");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [phase, setPhase] = useState<Phase>("loading");
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/user/connected-apps");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { apps?: ConnectedApp[] };
      setApps(data.apps ?? []);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = useCallback(
    async (app: ConnectedApp) => {
      const ok = await confirm({
        title: t("confirmTitle", { clientName: app.clientName }),
        message: t("confirmMessage", { clientName: app.clientName }),
        confirmLabel: t("disconnect"),
        variant: "destructive",
      });
      if (!ok) return;
      setBusyId(app.id);
      try {
        const res = await fetch(`/api/user/connected-apps/${encodeURIComponent(app.id)}`, { method: "DELETE" });
        // 404 means it is already gone (another tab, or it expired) — same end state.
        if (!res.ok && res.status !== 404) throw new Error(String(res.status));
        setApps((current) => current.filter((item) => item.id !== app.id));
        toast.success(t("disconnected", { clientName: app.clientName }));
      } catch {
        toast.error(t("disconnectError"));
      } finally {
        setBusyId(null);
      }
    },
    [confirm, t],
  );

  return (
    <section className="card-base rounded-3xl panel-body">
      {ConfirmDialogNode}
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("label")}</div>
      <h2 className="heading-section mt-1 flex items-center gap-2 font-semibold tracking-tight text-foreground">
        <PlugZap className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>

      {phase === "loading" && (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label={t("loading")}>
          {[0, 1].map((row) => (
            <Skeleton key={row} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{t("loadError")}</span>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      )}

      {phase === "ready" && apps.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground card-pad">
          {t("empty")}
        </p>
      )}

      {phase === "ready" && apps.length > 0 && (
        <ul className="mt-4 space-y-3">
          {apps.map((app) => (
            <li
              key={app.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 card-pad sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{app.clientName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("meta", {
                    connected: formatDate(app.connectedAt, undefined, locale),
                    used: formatDate(app.lastUsedAt, undefined, locale),
                  })}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {app.scopes.map((scope) => (
                    <li key={scope} className="rounded-full border border-border/60 bg-background text-xs text-foreground chip-pad">
                      {SCOPE_KEY[scope] ? tScope(SCOPE_KEY[scope]) : scope}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0 gap-1.5 rounded-xl text-destructive sm:min-h-9"
                onClick={() => void disconnect(app)}
                disabled={busyId !== null}
              >
                {busyId === app.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t("disconnect")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
