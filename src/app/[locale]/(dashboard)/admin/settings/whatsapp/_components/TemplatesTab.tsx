"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { API, SectionCard, categoryLabel, languageLabel, qualityLabel, templateStatusLabel, type Translator, type WaTemplate } from "./shared";

/** Spec §5b — created by hand in Meta Business Manager, in en and ar. */
const STARTER_TEMPLATES: ReadonlyArray<{ name: string; category: "UTILITY" | "MARKETING"; body: string }> = [
  { name: "mployedin_application_received", category: "UTILITY", body: "Hi {{1}}, thanks for applying. {{2}} You can track every step in your MPLOYEDIN dashboard." },
  { name: "mployedin_application_status", category: "UTILITY", body: "Hi {{1}}, there is an update on one of your applications. {{2}} Open MPLOYEDIN for the details." },
  { name: "mployedin_interview_invite", category: "UTILITY", body: "Hi {{1}}, good news. {{2}} Please check MPLOYEDIN to confirm your availability." },
  { name: "mployedin_interview_scheduled", category: "UTILITY", body: "Hi {{1}}, your interview is booked. {{2}} Reply here if you need to reschedule." },
  { name: "mployedin_interview_reminder", category: "UTILITY", body: "Hi {{1}}, a quick reminder. {{2}} Good luck from the MPLOYEDIN team." },
  { name: "mployedin_offer_update", category: "UTILITY", body: "Hi {{1}}, there is news about your offer. {{2}} Sign in to MPLOYEDIN to respond." },
  { name: "mployedin_commission_paid", category: "UTILITY", body: "Hi {{1}}, a commission update from MPLOYEDIN. {{2}} Your statement is in the Commissions page." },
  { name: "mployedin_admin_announcement", category: "MARKETING", body: "Hi {{1}}, a message from the MPLOYEDIN team: {{2}} You can change your WhatsApp preferences anytime in Settings." },
];

/**
 * The starter cards are instructions for Meta Business Manager, where the admin must tick Meta's own category name, so the
 * card gives both: the plain name and the name to choose there. Explicit branches (no dynamic key) for the two categories used.
 */
function starterCategoryLabel(category: "UTILITY" | "MARKETING", t: Translator): string {
  return category === "UTILITY" ? t("starterCategoryUtility") : t("starterCategoryMarketing");
}

function statusVariant(status: string): "success" | "destructive" | "warning" | "secondary" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED" || status === "DISABLED" || status === "PAUSED") return "destructive";
  if (status === "DELETED") return "secondary";
  return "warning";
}

/**
 * Copy for a failed sync, chosen by HTTP status. The route's `error` text is Meta's own wording or a
 * server note, so it is never rendered: 409 is "this server cannot sync", 502 "Meta answered with an error".
 */
function syncFailureCopy(httpStatus: number, t: Translator): string {
  if (httpStatus === 409) return t("syncNotConfigured");
  if (httpStatus === 502) return t("syncMetaError");
  return t("syncError");
}

/** `mode` is undefined until the status has loaded (and stays so if the load fails): Sync is on only for "live", the not-connected hint only for "mock". */
export function TemplatesTab({ mode }: { mode?: "live" | "mock" }) {
  const t = useTranslations("adminWhatsApp");
  const locale = useLocale();
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(API.templates);
      const data = res.ok ? ((await res.json()) as { templates?: WaTemplate[] }) : null;
      if (!data || !Array.isArray(data.templates)) throw new Error("templates");
      setTemplates(data.templates);
    } catch {
      setFailed(true);
      toast.error(t("templatesLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(API.templatesSync, { method: "POST" });
      if (!res.ok) {
        toast.error(syncFailureCopy(res.status, t));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { result?: { total?: number } };
      if (typeof data.result?.total !== "number") {
        toast.error(t("syncError"));
        return;
      }
      toast.success(t("syncDone", { total: data.result.total }));
      await load();
    } catch {
      toast.error(t("syncError"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title={t("templatesTitle")}
        icon={FileText}
        actions={
          <Button type="button" size="dense" variant="outline" onClick={sync} disabled={syncing || mode !== "live"}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? t("syncing") : t("syncButton")}
          </Button>
        }
      >
        <div className="panel-body space-y-3">
          <p className="text-sm text-muted-foreground">{t("templatesDesc")}</p>
          {mode === "mock" && <p className="text-xs text-amber-600">{t("syncDisabledMock")}</p>}
        </div>
        <div className="border-t border-border/40">
          {failed ? (
            <div className="p-4"><ErrorState onRetry={load} /></div>
          ) : !loading && templates.length === 0 ? (
            <div className="p-4"><EmptyState icon={FileText} title={t("noTemplates")} /></div>
          ) : (
            <Table className="responsive-card-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colLanguage")}</TableHead>
                  <TableHead>{t("colCategory")}</TableHead>
                  <TableHead>{t("colParams")}</TableHead>
                  <TableHead>{t("colQuality")}</TableHead>
                  <TableHead>{t("colUpdated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={4} cols={7} />
                ) : (
                  templates.map((x) => (
                    // (name, language) is the identity: a sync can delete and re-create rows, so _id is not stable.
                    <TableRow key={`${x.name}::${x.language}`}>
                      <TableCell className="break-all font-mono text-xs" dir="ltr" title={x.bodyText}>{x.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(x.status)}>{templateStatusLabel(x.status, t)}</Badge>
                      </TableCell>
                      <TableCell>{languageLabel(x.language, locale)}</TableCell>
                      <TableCell>{categoryLabel(x.category, t)}</TableCell>
                      <TableCell>{x.bodyParamCount}</TableCell>
                      <TableCell>{x.qualityScore ? qualityLabel(x.qualityScore, t) : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(x.lastSyncedAt, undefined, locale)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("starterTitle")} icon={FileText}>
        <div className="panel-body space-y-3">
          <p className="text-sm text-muted-foreground">{t("starterHelp")}</p>
          <ul className="space-y-2 text-sm">
            {STARTER_TEMPLATES.map((s) => (
              <li key={s.name} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code dir="ltr" className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{s.name}</code>
                  {/* Longer than a pill: it may wrap, so it is not a fixed-height round badge. */}
                  <Badge variant="outline" className="max-w-full whitespace-normal rounded-lg text-start">{starterCategoryLabel(s.category, t)}</Badge>
                </div>
                <p dir="ltr" className="mt-1 text-xs text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
