"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Pause, Pencil, Play, Plus, Send, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { RowActions } from "@/components/shared/RowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { useConfirm } from "@/hooks/useConfirm";
import { useTimezoneOptions } from "@/lib/i18n/useTimezoneOptions";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { API, SectionCard, TemplateLabel, fetchJson, roleLabel, runStatusLabel, type Translator, type WaSchedule, type WaTemplate } from "./shared";
import { ScheduleDialog } from "./ScheduleDialog";
import { TIMEZONES, describeRepeat, isSpentOneOff, repeatFromCron } from "./scheduleForm";

type PendingKind = "run" | "toggle" | "delete";

/**
 * Copy for a refused Run now, chosen by HTTP status and the route's error CODE. The code is machine text
 * and is never rendered; an unknown code (or any other status) lands on the generic copy.
 */
function runFailureCopy(httpStatus: number, code: unknown, t: Translator): string {
  if (httpStatus === 409 && code === "whatsapp_disabled") return t("runWhatsAppDisabled");
  if (httpStatus === 409 && code === "run_in_progress") return t("runInProgress");
  if (httpStatus === 409 && code === "too_soon") return t("runTooSoon");
  return t("runStartError");
}

function runTone(status: WaSchedule["lastRunStatus"]): string {
  if (status === "success") return "text-green-600";
  if (status === "partial") return "text-amber-600";
  if (status === "error") return "text-destructive";
  return "text-muted-foreground";
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Times are instants shown in the viewer's own zone; a bare "10:00" is ambiguous, so the zone is printed (lib/datetime/zone.ts). */
const WITH_ZONE: Intl.DateTimeFormatOptions = { timeZoneName: "short" };

export function SchedulesTab() {
  const t = useTranslations("adminWhatsApp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  // null until the first successful load: an empty array means "the server has none", null means "unknown".
  const [schedules, setSchedules] = useState<WaSchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [approved, setApproved] = useState<WaTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [pending, setPending] = useState<Record<string, PendingKind>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WaSchedule | null>(null);

  const loadSchedules = useCallback(async () => {
    const data = await fetchJson<{ schedules?: WaSchedule[] }>(API.schedules);
    if (Array.isArray(data?.schedules)) {
      setSchedules(data.schedules);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesFailed(false);
    const data = await fetchJson<{ templates?: WaTemplate[] }>(`${API.templates}?status=APPROVED`);
    setApproved(Array.isArray(data?.templates) ? data.templates : null);
    setTemplatesFailed(!Array.isArray(data?.templates));
  }, []);

  useEffect(() => {
    loadSchedules();
    loadTemplates();
  }, [loadSchedules, loadTemplates]);

  const retry = () => {
    setLoading(true);
    setFailed(false);
    loadSchedules();
  };

  const withPending = async (id: string, kind: PendingKind, work: () => Promise<void>) => {
    setPending((p) => ({ ...p, [id]: kind }));
    try {
      await work();
    } finally {
      setPending((p) => {
        const { [id]: _done, ...rest } = p;
        return rest;
      });
    }
  };

  /** The server answered 404: another admin deleted it. Say so and show the list as it is now. */
  const gone = async () => {
    toast.error(t("scheduleNotFound"));
    await loadSchedules();
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (s: WaSchedule) => {
    setEditing(s);
    setDialogOpen(true);
  };

  const toggle = (s: WaSchedule) =>
    withPending(s._id, "toggle", async () => {
      try {
        const res = await fetch(`${API.schedules}/${s._id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ enabled: !s.enabled }) });
        if (res.ok) await loadSchedules();
        else if (res.status === 404) await gone();
        // Resuming re-checks the timing: a spent one-time schedule or a cron that cannot fire is refused with a 400.
        else toast.error(res.status === 400 && !s.enabled ? t("scheduleResumeInvalid") : t("scheduleSaveError"));
      } catch {
        toast.error(t("scheduleSaveError"));
      }
    });

  const runNow = async (s: WaSchedule) => {
    // A send to a whole audience is not destructive, so the confirm button must not be the red one.
    const ok = await confirm({ title: t("runNow"), message: t("confirmRun", { name: s.name }), confirmLabel: t("runNow"), variant: "default" });
    if (!ok) return;
    await withPending(s._id, "run", async () => {
      try {
        const res = await fetch(`${API.schedules}/${s._id}/run`, { method: "POST" });
        if (res.ok) {
          toast.success(t("runQueued"));
          await loadSchedules();
          return;
        }
        if (res.status === 404) {
          await gone();
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        toast.error(runFailureCopy(res.status, data.error, t));
      } catch {
        toast.error(t("runStartError"));
      }
    });
  };

  const remove = async (s: WaSchedule) => {
    const ok = await confirm({ title: t("deleteSchedule"), message: t("confirmDelete", { name: s.name }), confirmLabel: t("deleteSchedule"), variant: "destructive" });
    if (!ok) return;
    await withPending(s._id, "delete", async () => {
      try {
        const res = await fetch(`${API.schedules}/${s._id}`, { method: "DELETE" });
        if (res.ok) await loadSchedules();
        else if (res.status === 404) await gone();
        else toast.error(t("scheduleDeleteError"));
      } catch {
        toast.error(t("scheduleDeleteError"));
      }
    });
  };

  // A schedule's zone is shown as a city and offset ("Dubai (GMT+4)"), never as the stored id. A zone the dialog's list
  // lacks (the API can store any real one) is added so it is named too; the hook falls back to the id's last word.
  const zoneIds = useMemo(() => Array.from(new Set([...TIMEZONES, ...(schedules ?? []).map((s) => s.timezone)])), [schedules]);
  const { options: zoneOptions } = useTimezoneOptions(zoneIds, "");
  const zoneName = (zone: string) => zoneOptions.find((option) => option.value === zone)?.label ?? zone;

  const now = new Date();
  const audienceOf = (s: WaSchedule) => (s.audience.targetAll ? t("audienceAll") : s.audience.targetRoles.map((r) => roleLabel(r, t)).join(", ") || "—");
  // The cron itself is never shown: a timing the picker cannot express (only the API can set one) is named instead.
  const repeatOf = (s: WaSchedule) => {
    const repeat = s.cron ? repeatFromCron(s.cron) : null;
    return repeat ? describeRepeat(repeat, t, locale) : t("repeatCustom");
  };

  return (
    <>
      <SectionCard
        title={t("schedulesTitle")}
        icon={CalendarClock}
        actions={
          <Button type="button" size="dense" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> {t("newSchedule")}
          </Button>
        }
      >
        <div className="panel-body">
          <p className="text-sm text-muted-foreground">{t("schedulesDesc")}</p>
        </div>
        <div className="border-t border-border/40">
          {failed ? (
            <div className="p-4"><ErrorState description={t("schedulesLoadError")} onRetry={retry} /></div>
          ) : !loading && schedules?.length === 0 ? (
            <div className="p-4"><EmptyState icon={CalendarClock} title={t("noSchedules")} /></div>
          ) : (
            <Table className="responsive-card-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fieldName")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead>{t("colSchedule")}</TableHead>
                  <TableHead>{t("colAudience")}</TableHead>
                  <TableHead>{t("colNextRun")}</TableHead>
                  <TableHead>{t("colLastRun")}</TableHead>
                  <TableHead className="text-end">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || !schedules ? (
                  <TableBodySkeleton rows={3} cols={7} />
                ) : (
                  schedules.map((s) => {
                    const busy = Boolean(pending[s._id]);
                    const spent = isSpentOneOff(s, now);
                    return (
                      <TableRow key={s._id}>
                        <TableCell>
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                            <TemplateLabel name={s.template.templateName} language={s.template.language} locale={locale} nameClassName="font-mono" />
                          </span>
                        </TableCell>
                        <TableCell>
                          {/* A fired one-off is switched off by the runner: it is done, not paused, and cannot be resumed. */}
                          <Badge variant={s.enabled ? "success" : "secondary"}>{s.enabled ? t("scheduleActive") : spent ? t("scheduleCompleted") : t("schedulePaused")}</Badge>
                        </TableCell>
                        <TableCell>
                          <span>{s.kind === "once" ? t("kindOnce") : t("kindRecurring")}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {s.kind === "once" ? (
                              s.runAt ? formatDateTime(s.runAt, WITH_ZONE, locale) : "—"
                            ) : (
                              <>
                                <span>{repeatOf(s)}</span> · <bdi>{zoneName(s.timezone)}</bdi>
                              </>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>{audienceOf(s)}</TableCell>
                        {/* A paused schedule keeps the nextRunAt it had when it was paused: it is not going to run then. */}
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {s.enabled && s.nextRunAt ? formatDateTime(s.nextRunAt, WITH_ZONE, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          {s.lastRunAt ? (
                            <>
                              {s.lastRunStatus && <span className={runTone(s.lastRunStatus)}>{runStatusLabel(s.lastRunStatus, t)}</span>}
                              <span className="block text-[11px] text-muted-foreground">{formatDateTime(s.lastRunAt, WITH_ZONE, locale)}</span>
                              {s.lastRunSummary && (
                                <span className="block text-[11px] text-muted-foreground">
                                  {t("runSummary", { sent: s.lastRunSummary.sent, failed: s.lastRunSummary.failed, skipped: s.lastRunSummary.skipped })}
                                </span>
                              )}
                            </>
                          ) : s.lastRunStatus === "error" ? (
                            // An occurrence the runner refused (WhatsApp switched off, no audience, a cron that cannot fire) is recorded
                            // as an error without a lastRunAt: nothing was sent, so there is no time or count to show.
                            <>
                              <span className={runTone("error")}>{runStatusLabel("error", t)}</span>
                              <span className="block text-[11px] text-muted-foreground">{t("scheduleNothingSent")}</span>
                            </>
                          ) : (
                            // The stored summary defaults to zeros, so only a missing lastRunAt means it never ran.
                            <span className="text-muted-foreground">{t("never")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RowActions
                            name={s.name}
                            quick={[
                              { key: "edit", label: t("editSchedule"), icon: Pencil, iconOnly: true, onSelect: () => openEdit(s) },
                              { key: "run", label: t("runNow"), icon: Send, onSelect: () => runNow(s), pending: pending[s._id] === "run", disabled: busy },
                            ]}
                            menu={[
                              // The server refuses to resume a fired one-off (its time is past); Edit with a new time is the way back.
                              ...(spent ? [] : [{ key: "toggle", label: s.enabled ? t("pause") : t("resume"), icon: s.enabled ? Pause : Play, onSelect: () => toggle(s), disabled: busy }]),
                              { key: "delete", label: t("deleteSchedule"), icon: Trash2, destructive: true, onSelect: () => remove(s), disabled: busy },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>

      <ScheduleDialog
        open={dialogOpen}
        editing={editing}
        approved={approved}
        templatesFailed={templatesFailed}
        onRetryTemplates={loadTemplates}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          toast.success(t("saved"));
          setDialogOpen(false);
          loadSchedules();
        }}
        onGone={() => {
          setDialogOpen(false);
          gone();
        }}
      />
      {ConfirmDialogNode}
    </>
  );
}
