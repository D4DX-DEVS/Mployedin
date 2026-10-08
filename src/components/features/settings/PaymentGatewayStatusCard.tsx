"use client";

/**
 * Read-only online-payment status for admin settings: provider, test/live
 * mode, which keys are present (never their values), the webhook URL to paste
 * into the provider dashboard and the events to enable. Configuration itself
 * lives in environment variables — see docs/PAYMENTS.md.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, CreditCard, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface GatewayStatus {
  enabled: boolean;
  provider: "stripe" | "razorpay" | null;
  requestedProvider: string | null;
  mode: "test" | "live" | null;
  secretKeyConfigured: boolean;
  publishableKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  defaultCurrency: string;
  webhookUrl: string;
  webhookEvents: string[];
  issues: string[];
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
      ) : (
        <X className="h-4 w-4 text-destructive" aria-hidden="true" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export function PaymentGatewayStatusCard() {
  const t = useTranslations("paymentGatewayStatus");
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/payments/status")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d) => setStatus(d.status ?? null))
      .catch(() => setFailed(true));
  }, []);

  const copyWebhook = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the URL is visible to select manually */
    }
  };

  return (
    <section className="workspace-panel-surface rounded-3xl panel-body space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-section font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="h-4 w-4" aria-hidden="true" /> {t("title")}
        </h2>
        {status && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={status.enabled ? "text-emerald-600 border-emerald-500/30" : "text-muted-foreground"}>
              {status.enabled ? t("enabled") : t("manualOnly")}
            </Badge>
            {status.mode && (
              <Badge variant="outline" className={status.mode === "live" ? "text-red-600 border-red-500/30" : "text-amber-600 border-amber-500/30"}>
                {status.mode === "live" ? t("liveMode") : t("testMode")}
              </Badge>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t("description")}</p>

      {failed && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

      {status && (
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t("providerLabel")}</dt>
              <dd className="font-medium capitalize">{status.provider ?? t("none")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("currencyLabel")}</dt>
              <dd className="font-medium">{status.defaultCurrency}</dd>
            </div>
          </dl>

          {status.provider && (
            <ul className="space-y-1.5">
              <Flag ok={status.secretKeyConfigured} label={t("secretKey")} />
              <Flag ok={status.webhookSecretConfigured} label={t("webhookSecret")} />
              <Flag ok={status.publishableKeyConfigured} label={t("publishableKey")} />
            </ul>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("webhookUrlLabel")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs">
                {status.webhookUrl}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyWebhook} aria-label={t("copyWebhookUrl")}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {status.webhookEvents.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("eventsLabel")}</p>
              <div className="flex flex-wrap gap-1.5">
                {status.webhookEvents.map((e) => (
                  <code key={e} className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]">{e}</code>
                ))}
              </div>
            </div>
          )}

          {status.issues.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              {status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">{t("envHint")}</p>
        </div>
      )}
    </section>
  );
}
