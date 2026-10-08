"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/ui/intlFormat";

type Method = "accept_all" | "reject_all" | "custom" | "withdraw" | "gpc";

interface ConsentItem {
  _id: string;
  consentId: string;
  signedIn: boolean;
  policyVersion: string;
  choices: { functional: boolean; analytics: boolean; marketing: boolean };
  method: Method;
  gpc: boolean;
  locale?: string;
  country?: string;
  createdAt: string;
}

interface ConsentResponse {
  policyVersion: string;
  days: number;
  stats: {
    total: number;
    byMethod: Partial<Record<Method, number>>;
    granted: { functional: number; analytics: number; marketing: number };
    gpc: number;
  };
  items: ConsentItem[];
  total: number;
}

const PAGE_SIZE = 10;
const METHODS: Method[] = ["accept_all", "reject_all", "custom", "withdraw", "gpc"];

/** Admin → GDPR → Cookie consent: proof-of-consent records and opt-in rates. */
export function CookieConsentPanel() {
  const t = useTranslations("adminCookieConsent");
  const locale = useLocale();
  const [data, setData] = useState<ConsentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(30);
  const [method, setMethod] = useState<"" | Method>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), days: String(days) });
      if (method) params.set("method", method);
      const res = await fetch(`/api/admin/gdpr/cookie-consents?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ConsentResponse);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, days, method]);

  useEffect(() => {
    void load();
  }, [load]);

  const pct = (n: number) => (data && data.stats.total > 0 ? `${Math.round((n / data.stats.total) * 100)}%` : "–");
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description", { version: data?.policyVersion ?? "…" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("periodLabel")}</span>
            <select
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
              value={days}
              onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}
            >
              {[7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>{t("lastDays", { days: d })}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("methodLabel")}</span>
            <select
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
              value={method}
              onChange={(e) => { setMethod(e.target.value as "" | Method); setPage(1); }}
            >
              <option value="">{t("allMethods")}</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>{t(`methods.${m}`)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {data && (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: t("statTotal"), value: String(data.stats.total) },
            { label: t("statAcceptAll"), value: pct(data.stats.byMethod.accept_all ?? 0) },
            { label: t("statRejectAll"), value: pct((data.stats.byMethod.reject_all ?? 0) + (data.stats.byMethod.withdraw ?? 0)) },
            { label: t("statAnalytics"), value: pct(data.stats.granted.analytics) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm" role="alert">
          {t("loadError")}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => void load()}>{t("retry")}</Button>
        </div>
      ) : (
        <div className="overflow-x-auto" aria-busy={loading}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colDate")}</TableHead>
                <TableHead>{t("colConsentId")}</TableHead>
                <TableHead>{t("colMethod")}</TableHead>
                <TableHead>{t("colChoices")}</TableHead>
                <TableHead>{t("colVersion")}</TableHead>
                <TableHead>{t("colContext")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t("empty")}</TableCell>
                </TableRow>
              )}
              {data?.items.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt, undefined, locale)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.consentId.slice(0, 8)}…</TableCell>
                  <TableCell>{t(`methods.${r.method}`)}</TableCell>
                  <TableCell className="text-xs">
                    {(["functional", "analytics", "marketing"] as const)
                      .map((c) => `${t(`categories.${c}`)}: ${r.choices[c] ? t("on") : t("off")}`)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="text-xs">{r.policyVersion}</TableCell>
                  <TableCell className="text-xs">
                    {[r.signedIn ? t("signedIn") : t("anonymous"), r.locale?.toUpperCase(), r.country, r.gpc ? "GPC" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("pageOf", { page, total: totalPages })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            {t("previous")}
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            {t("next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
