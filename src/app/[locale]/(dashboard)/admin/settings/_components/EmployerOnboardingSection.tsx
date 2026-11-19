"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";

type FlagKey =
  | "employerSelfRegistrationEnabled"
  | "employerInviteLinksEnabled"
  | "superAgentCanCreateEmployers"
  | "agentCanCreateEmployers";

type Flags = Record<FlagKey, boolean>;

const DEFAULTS: Flags = {
  employerSelfRegistrationEnabled: false,
  employerInviteLinksEnabled: true,
  superAgentCanCreateEmployers: true,
  agentCanCreateEmployers: true,
};

const ROWS: { key: FlagKey; label: string; help: string }[] = [
  { key: "employerSelfRegistrationEnabled", label: "selfRegistrationLabel", help: "selfRegistrationHelp" },
  { key: "employerInviteLinksEnabled", label: "inviteLinksLabel", help: "inviteLinksHelp" },
  { key: "superAgentCanCreateEmployers", label: "superAgentCreateLabel", help: "superAgentCreateHelp" },
  { key: "agentCanCreateEmployers", label: "agentCreateLabel", help: "agentCreateHelp" },
];

/**
 * Admin → Settings → Employers. Who may bring a new employer onto the platform.
 * Each switch saves on its own (no shared Save bar); admins can always add employers.
 */
export function EmployerOnboardingSection() {
  const t = useTranslations("employerAccess.admin");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [flags, setFlags] = useState<Flags>(DEFAULTS);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState<FlagKey | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch("/api/admin/settings")
      .then((res) => {
        if (!res.ok) throw new Error(`settings ${res.status}`);
        return res.json() as Promise<{ settings?: Partial<Flags> }>;
      })
      .then((data) => {
        if (!alive) return;
        const s = data.settings ?? {};
        setFlags({
          employerSelfRegistrationEnabled: s.employerSelfRegistrationEnabled ?? DEFAULTS.employerSelfRegistrationEnabled,
          employerInviteLinksEnabled: s.employerInviteLinksEnabled ?? DEFAULTS.employerInviteLinksEnabled,
          superAgentCanCreateEmployers: s.superAgentCanCreateEmployers ?? DEFAULTS.superAgentCanCreateEmployers,
          agentCanCreateEmployers: s.agentCanCreateEmployers ?? DEFAULTS.agentCanCreateEmployers,
        });
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const change = async (key: FlagKey, value: boolean) => {
    if (key === "employerSelfRegistrationEnabled" && value) {
      const ok = await confirm({ title: t("confirmOpenTitle"), message: t("confirmOpenBody"), confirmLabel: t("confirmOpenAction") });
      if (!ok) return;
    }
    const previous = flags[key];
    setFlags((f) => ({ ...f, [key]: value }));
    setSaving(key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      toast.success(t("saved"));
    } catch {
      setFlags((f) => ({ ...f, [key]: previous }));
      toast.error(t("saveError"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="workspace-panel-surface rounded-3xl divide-y" aria-labelledby="admin-employer-onboarding-title">
      {ConfirmDialogNode}
      <div className="panel-body">
        <h2 id="admin-employer-onboarding-title" className="heading-section flex items-center gap-2 font-semibold text-foreground">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {state === "loading" &&
        ROWS.map((row) => (
          <div key={row.key} className="panel-body flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
        ))}

      {state === "error" && (
        <div className="panel-body flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            {t("retry")}
          </Button>
        </div>
      )}

      {state === "ready" &&
        ROWS.map((row) => {
          const labelId = `employer-onboarding-${row.key}`;
          return (
            <div key={row.key} className="panel-body flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div id={labelId} className="font-medium text-foreground">
                  {t(row.label)}
                </div>
                <div className="text-sm text-muted-foreground">{t(row.help)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {saving === row.key && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
                <Switch
                  checked={flags[row.key]}
                  disabled={saving !== null}
                  onCheckedChange={(checked) => void change(row.key, checked)}
                  aria-labelledby={labelId}
                />
              </div>
            </div>
          );
        })}

      {state === "ready" && <p className="panel-body text-xs text-muted-foreground">{t("adminNote")}</p>}
    </section>
  );
}
