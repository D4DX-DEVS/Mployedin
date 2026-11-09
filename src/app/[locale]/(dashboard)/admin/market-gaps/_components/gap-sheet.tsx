"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/shared/ErrorState";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";
import { postJson, useGapAgents, useGapDetail, useInvalidateGaps } from "@/components/features/admin/market-gaps/useMarketGaps";
import { gapSentence } from "./gap-text";

type Mode = "view" | "assign" | "dismiss";

export function GapSheet({ id, initialMode, onClose }: { id: string | null; initialMode: Mode; onClose: () => void }) {
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {id ? <SheetBody key={id} id={id} initialMode={initialMode} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SheetBody({ id, initialMode, onClose }: { id: string; initialMode: Mode; onClose: () => void }) {
  const t = useTranslations("adminMarketGaps");
  const ts = useTranslations("adminMarketGaps.sheet");
  const locale = useLocale();
  const { data, error, refetch } = useGapDetail(id);
  const invalidate = useInvalidateGaps();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [agent, setAgent] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const agents = useGapAgents(id, mode === "assign");

  if (error && !data) return <ErrorState title={t("loadError")} onRetry={() => { void refetch(); }} />;
  if (!data) {
    return (
      <div role="status" aria-label={t("loading")} className="space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded bg-secondary" />
        <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }

  const text = gapSentence(t, data);
  const maxTrend = Math.max(1, ...data.trend.flatMap((p) => [p.seekers, p.jobs]));
  const open = data.status === "new" || data.status === "assigned";

  async function run(url: string, body: unknown, okMsg: string, errMsg: string) {
    setBusy(true);
    const res = await postJson(url, body);
    setBusy(false);
    if (!res.ok) {
      toast.error(typeof res.data.error === "string" && res.status !== 500 ? res.data.error : errMsg);
      return;
    }
    toast.success(okMsg);
    invalidate();
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg leading-snug">{text}</DialogTitle>
        <DialogDescription>
          {[data.areaName || t("areaNotSet"), data.saName, ts("firstSeen", { date: formatDate(data.firstSeenAt, undefined, locale) })].filter(Boolean).join(" · ")}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-3">
        {[
          [ts("seekersWaiting"), formatCount(data.seekers, undefined, locale)],
          [ts("openJobs"), formatCount(data.jobs, undefined, locale)],
          [ts("medianWait"), t("days", { count: data.medianWaitDays })],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {data.trend.length > 1 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ts("trendTitle")}</h3>
          <div role="img" aria-label={ts("trendTitle")} className="flex h-24 items-end gap-2 border-b border-border/70">
            {data.trend.map((p) => (
              <div key={p.at} className="flex h-full flex-1 items-end gap-0.5">
                <div className="flex-1 rounded-t bg-primary" style={{ height: `${(p.seekers / maxTrend) * 100}%` }} />
                <div className="flex-1 rounded-t bg-amber-500" style={{ height: `${Math.max(2, (p.jobs / maxTrend) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" />{ts("trendSeekers")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" />{ts("trendJobs")}</span>
          </p>
        </section>
      ) : null}

      {data.topSkills.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ts("skillsTitle")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.topSkills.map((s) => (
              <span key={s.skill} className="rounded-full bg-secondary px-2.5 py-1 text-xs">{s.skill} · {s.count}</span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ts("sampleTitle")}</h3>
        {data.seekerSample.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ts("sampleNone")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.seekerSample.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{k.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{k.skills.join(", ")}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{t("days", { count: k.waitDays })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ts("historyTitle")}</h3>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ts("historyNone")}</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {[...data.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="font-medium">{ts(`actions.${h.action}` as never)}</span>
                <span className="text-muted-foreground"> · {formatDate(h.at, undefined, locale)}{h.by ? ` · ${h.by}` : ""}{h.note ? ` · ${h.note}` : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {mode === "assign" ? (
        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <div>
            <h3 className="font-semibold">{ts("assignTitle")}</h3>
            <p className="text-xs text-muted-foreground">{ts("assignHint")}</p>
          </div>
          {agents.data && agents.data.agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ts("noAgents")}</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="gap-agent">{ts("agent")}</Label>
              <Select value={agent} onValueChange={setAgent}>
                <SelectTrigger id="gap-agent" className="h-10"><SelectValue placeholder={ts("pickAgent")} /></SelectTrigger>
                <SelectContent>
                  {(agents.data?.agents ?? []).map((a) => (
                    <SelectItem key={a.userId} value={a.userId}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="gap-note">{ts("note")}</Label>
            <Textarea id="gap-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <Button disabled={!agent || busy} onClick={() => run(`/api/admin/market-gaps/${id}/assign`, { agentUserId: agent, note: note || undefined }, ts("assigned"), ts("assignError"))}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {ts("assignAction")}
          </Button>
        </section>
      ) : null}

      {mode === "dismiss" ? (
        <section className="space-y-3 rounded-2xl border border-border/70 p-4">
          <h3 className="font-semibold">{ts("dismissTitle")}</h3>
          <div className="space-y-1.5">
            <Label htmlFor="gap-reason">{ts("dismissReason")}</Label>
            <Textarea id="gap-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
          </div>
          <Button variant="destructive" disabled={!reason.trim() || busy} onClick={() => run(`/api/admin/market-gaps/${id}/status`, { status: "dismissed", reason }, ts("dismissed"), ts("statusError"))}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {ts("dismissAction")}
          </Button>
        </section>
      ) : null}

      {mode === "view" ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          {open ? (
            <>
              <Button className="min-h-11 flex-1" onClick={() => setMode("assign")}>{t("assign")}</Button>
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => run(`/api/admin/market-gaps/${id}/status`, { status: "done" }, ts("doneSaved"), ts("statusError"))}>{ts("markDone")}</Button>
              <Button variant="outline" className="min-h-11" onClick={() => setMode("dismiss")}>{t("dismiss")}</Button>
            </>
          ) : (
            <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => run(`/api/admin/market-gaps/${id}/status`, { status: "new" }, ts("reopened"), ts("statusError"))}>{ts("reopen")}</Button>
          )}
        </div>
      ) : null}
    </>
  );
}
