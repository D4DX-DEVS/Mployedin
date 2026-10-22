"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  STATUS_BADGES,
  STATUS_LABEL_KEYS,
  formatDate,
  formatMoney,
} from "../../_lib/exhibitions";

interface PanelStats {
  requests: number;
  inReview: number;
  approved: number;
  completed: number;
  rejected: number;
  approvalRate: number;
  expectedLeads: number;
  leadsCollected: number;
  approvedBudget: Record<string, number>;
  actualSpend: Record<string, number>;
}

export interface TeamPanelSubject {
  title: string;
  subtitle?: string;
  stats: PanelStats;
  /** The agents' user ids whose requests are listed. */
  agentIds: string[];
  /** The agents under a super agent, for the team view; absent for one agent. */
  agents?: (PanelStats & { agentId: string; name: string; email?: string })[];
}

interface RequestRow {
  _id: string;
  eventName: string;
  status: string;
  eventStartDate?: string;
  budgetCurrency?: string;
  estimatedBudget?: number;
  approvedBudget?: number;
  agentId?: { name?: string } | null;
}

/**
 * The team report's detail view (owner, 2026-10-15: "clicking time detailed
 * view can show"): one super agent's team, or one agent, with the year's
 * figures, every agent under them, and their latest requests.
 */
export function TeamDetailPanel({
  subject,
  formatMoneyByCurrency,
  onClose,
}: {
  subject: TeamPanelSubject | null;
  formatMoneyByCurrency: (money: Record<string, number>) => string;
  onClose: () => void;
}) {
  const t = useTranslations("adminExhibitionsAnalytics.teams");
  const ta = useTranslations("adminExhibitions");
  const locale = useLocale();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ids = subject?.agentIds.join(",") ?? "";

  useEffect(() => {
    if (!ids) { setRows([]); setTotal(0); return; }
    let cancelled = false;
    setRows(null);
    setFailed(false);
    const params = new URLSearchParams({ agents: ids, limit: "50", sortBy: "createdAt", sortOrder: "desc" });
    fetch(`/api/exhibitions?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => { if (!cancelled) { setRows(data.items ?? []); setTotal(data.total ?? 0); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [ids, attempt]);

  const stats = subject?.stats;
  const tiles = stats
    ? [
        { label: t("colRequests"), value: String(stats.requests) },
        { label: t("colInReview"), value: String(stats.inReview) },
        { label: t("colApproved"), value: String(stats.approved) },
        { label: t("colCompleted"), value: String(stats.completed) },
        { label: t("colApprovalRate"), value: stats.approved + stats.rejected > 0 ? `${stats.approvalRate}%` : "-" },
        { label: t("colLeads"), value: stats.completed > 0 || stats.leadsCollected > 0 ? t("leadsValue", { collected: stats.leadsCollected, expected: stats.expectedLeads }) : "-" },
        { label: t("colApprovedBudget"), value: formatMoneyByCurrency(stats.approvedBudget) },
        { label: t("colActualSpend"), value: formatMoneyByCurrency(stats.actualSpend) },
      ]
    : [];

  return (
    <Dialog open={!!subject} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-[640px]">
        {subject && (
          <>
            <DialogHeader className="space-y-0.5 border-b px-5 py-4 pe-14 text-start">
              <DialogTitle className="truncate">{subject.title}</DialogTitle>
              <DialogDescription>{subject.subtitle ?? t("panelDescription")}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tiles.map((tile) => (
                  <div key={tile.label} className="min-w-0 rounded-xl border border-border/60 bg-muted/10 chip-pad">
                    <dt className="truncate text-xs text-muted-foreground">{tile.label}</dt>
                    <dd className="mt-1 truncate text-sm font-semibold text-foreground" title={tile.value}>{tile.value}</dd>
                  </div>
                ))}
              </dl>

              {subject.agents && (
                <section>
                  <h3 className="heading-label mb-3 font-semibold text-foreground">{t("panelAgents", { count: subject.agents.length })}</h3>
                  {subject.agents.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("noAgents")}</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                      {subject.agents.map((agent) => (
                        <li key={agent.agentId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{agent.name || t("unnamed")}</span>
                            {agent.email && <span className="block truncate text-xs text-muted-foreground">{agent.email}</span>}
                          </span>
                          <span className="shrink-0 text-end text-xs text-muted-foreground">
                            {t("panelAgentLine", { requests: agent.requests, approved: agent.approved, completed: agent.completed })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section>
                <h3 className="heading-label mb-3 font-semibold text-foreground">
                  {rows ? t("panelRequests", { count: total }) : t("panelRequestsLoading")}
                </h3>
                {failed ? (
                  <ErrorState description={t("panelRequestsError")} onRetry={() => setAttempt((n) => n + 1)} />
                ) : rows === null ? (
                  <div className="space-y-2" aria-busy="true">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                  </div>
                ) : rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("panelNoRequests")}</p>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
                    {rows.map((row) => (
                      <li key={row._id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{row.eventName}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            {row.agentId?.name && subject.agents && <span className="truncate">{row.agentId.name}</span>}
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" aria-hidden="true" />
                              {formatDate(row.eventStartDate, locale)}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge className={`${STATUS_BADGES[row.status] ?? ""} rounded-md px-2 py-0.5 text-[11px] font-semibold`}>
                            {STATUS_LABEL_KEYS[row.status] ? ta(STATUS_LABEL_KEYS[row.status]) : row.status}
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {row.approvedBudget
                              ? formatMoney(row.approvedBudget, row.budgetCurrency)
                              : row.estimatedBudget
                                ? formatMoney(row.estimatedBudget, row.budgetCurrency)
                                : "-"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {rows && total > rows.length && (
                  <p className="mt-2 text-xs text-muted-foreground">{t("panelRequestsMore", { shown: rows.length, total })}</p>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
