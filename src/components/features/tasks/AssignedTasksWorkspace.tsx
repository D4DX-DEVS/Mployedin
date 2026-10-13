"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Calendar, CheckCircle2, ClipboardList, Clock, Plus, Undo2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { EmptyState } from "@/components/shared/EmptyState";
import { RowActions } from "@/components/shared/RowActions";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatListDate } from "@/lib/ui/intlFormat";
import { AssignTaskDialog, ReviewTaskDialog, type AssignableAgentOption, type ReviewTarget } from "./AssignTaskDialogs";
import { TASK_STATE_CLASS, taskState, taskStateKey } from "./taskState";

interface AssignedTaskRow {
  _id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: string;
  reviewStatus: string;
  dueDate?: string;
  completionNote?: string;
  reviewComment?: string;
  agentName: string;
  assignedByName: string;
  assignedByRole?: "super_agent" | "admin";
  canReview: boolean;
}

const PRIORITY_CLASS: Record<string, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-emerald-600 bg-emerald-50",
};

/**
 * Tasks a super agent gives their team, or an admin gives any agent, and the
 * review of what comes back. The API decides the scope from the caller's role;
 * this view only differs in its title and whether it names the assigner.
 */
export function AssignedTasksWorkspace({ audience }: { audience: "super_agent" | "admin" }) {
  const t = useTranslations("assignedTasks");
  const tc = useTranslations("common");
  const apiBase = audience === "admin" ? "/api/admin/agent-tasks" : "/api/super-agent/tasks";
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [rows, setRows] = useState<AssignedTaskRow[]>([]);
  const [stats, setStats] = useState({ open: 0, awaitingReview: 0, returned: 0, approved: 0 });
  const [agents, setAgents] = useState<AssignableAgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  // `review` is what notifications link to (?review=awaiting_review).
  const [review, setReview] = useUrlFilter("review", "all");
  const [status, setStatus] = useUrlFilter("status", "all");
  const [agent, setAgent] = useUrlFilter("agent", "all");
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (review !== "all") params.set("review", review);
      if (status !== "all") params.set("status", status);
      if (agent !== "all") params.set("agent", agent);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${apiBase}?${params}`);
      if (!res.ok) { toast.error(t("loadError")); return; }
      const data = await res.json();
      setRows(data.items ?? []);
      setStats(data.stats ?? { open: 0, awaitingReview: 0, returned: 0, approved: 0 });
      updateTotal(data.total ?? 0);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [apiBase, page, limit, review, status, agent, search, updateTotal, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { resetPage(); }, [review, status, agent, search, resetPage]);

  // The picker list: the agents this caller may assign to (their team, or all).
  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}?withAgents=1&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.agents) setAgents(d.agents); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiBase]);

  const toggle = (setter: (v: string) => void, current: string, value: string) => setter(current === value ? "all" : value);
  const filtered = search.trim() !== "" || review !== "all" || status !== "all" || agent !== "all";
  const clearAll = () => { setSearch(""); setReview("all"); setStatus("all"); setAgent("all"); };
  const cols = audience === "admin" ? 6 : 5;

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={audience === "admin" ? t("adminTitle") : t("superAgentTitle")}
        context={audience === "admin" ? t("adminContext") : t("superAgentContext")}
        actions={
          <Button onClick={() => setAssignOpen(true)} className="min-h-11 gap-2 rounded-xl px-3 text-sm font-semibold sm:px-4" aria-label={t("assignButton")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("assignButton")}</span>
          </Button>
        }
        metrics={[
          { label: t("metricOpen"), value: stats.open, icon: Clock, tone: "primary", onClick: () => toggle(setStatus, status, "open"), active: status === "open" },
          { label: t("metricAwaiting"), value: stats.awaitingReview, icon: ListChecks, tone: "warning", onClick: () => toggle(setReview, review, "awaiting_review"), active: review === "awaiting_review" },
          { label: t("metricReturned"), value: stats.returned, icon: Undo2, tone: "info", onClick: () => toggle(setReview, review, "returned"), active: review === "returned" },
          { label: t("metricApproved"), value: stats.approved, icon: CheckCircle2, tone: "success", onClick: () => toggle(setReview, review, "approved"), active: review === "approved" },
        ]}
      />

      <InlineFilterBar className="workspace-panel-surface rounded-2xl border-b-0" onClear={filtered ? clearAll : undefined}>
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
        <SearchableSelect
          options={[{ value: "all", label: t("filterAllAgents") }, ...agents.map((a) => ({ value: a.userId, label: a.name || a.email }))]}
          value={agent}
          onValueChange={setAgent}
          ariaLabel={t("fieldAgent")}
          className={INLINE_FILTER_CONTROL}
        />
        <SearchableSelect
          options={[
            { value: "all", label: t("filterAllReview") },
            { value: "awaiting_review", label: t("stateAwaitingReview") },
            { value: "returned", label: t("stateReturned") },
            { value: "approved", label: t("stateApproved") },
          ]}
          value={review}
          onValueChange={setReview}
          ariaLabel={t("columnState")}
          className={INLINE_FILTER_CONTROL}
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[240px]">{t("columnTask")}</TableHead>
                <TableHead>{t("columnAgent")}</TableHead>
                {audience === "admin" && <TableHead>{t("columnAssignedBy")}</TableHead>}
                <TableHead>{t("columnState")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("columnDue")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={cols + 1} />
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={cols + 1} className="p-0">
                    <EmptyState
                      icon={ClipboardList}
                      className="rounded-none border-0 bg-transparent"
                      title={filtered ? t("noResultsTitle") : t("emptyTitle")}
                      description={filtered ? t("noResultsDescription") : t("emptyDescription")}
                      action={filtered
                        ? <Button variant="outline" size="sm" onClick={clearAll}>{tc("clearFilters")}</Button>
                        : <Button size="sm" onClick={() => setAssignOpen(true)}>{t("assignButton")}</Button>}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.map((task) => {
                const state = taskState(task);
                const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";
                return (
                  <TableRow key={task._id}>
                    <TableCell>
                      <div className="min-w-0 space-y-1">
                        <p className="break-words text-sm font-medium text-foreground">{task.title}</p>
                        {task.description && <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[task.priority]}`}>
                          {task.priority === "high" ? t("priorityHigh") : task.priority === "low" ? t("priorityLow") : t("priorityMedium")}
                        </span>
                        {task.completionNote && (state === "awaiting_review" || state === "approved") && (
                          <p className="rounded-lg bg-muted/40 px-2 py-1 text-xs text-foreground/80">
                            <span className="font-semibold">{t("agentNoteLabel")}:</span> {task.completionNote}
                          </p>
                        )}
                        {task.reviewComment && (state === "returned" || state === "approved") && (
                          <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            <span className="font-semibold">{t("reviewCommentLabel")}:</span> {task.reviewComment}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{task.agentName || "—"}</TableCell>
                    {audience === "admin" && (
                      <TableCell className="text-sm">
                        <span className="block whitespace-nowrap">{task.assignedByName || "—"}</span>
                        <span className="text-xs text-muted-foreground">{task.assignedByRole === "admin" ? t("roleAdmin") : t("roleSuperAgent")}</span>
                      </TableCell>
                    )}
                    <TableCell>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATE_CLASS[state]}`}>
                        {t(taskStateKey(state))}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.dueDate ? (
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>
                          <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {formatListDate(new Date(task.dueDate))}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {task.canReview ? (
                        <RowActions
                          name={task.title}
                          labelsFrom="wide"
                          quick={[
                            { key: "approve", label: t("approveAction"), icon: CheckCircle2, iconClassName: "text-emerald-600", onSelect: () => setReviewTarget({ id: task._id, title: task.title, agentName: task.agentName, completionNote: task.completionNote, action: "approve" }) },
                            { key: "return", label: t("returnAction"), icon: Undo2, iconClassName: "text-amber-600", onSelect: () => setReviewTarget({ id: task._id, title: task.title, agentName: task.agentName, completionNote: task.completionNote, action: "return" }) },
                          ]}
                        />
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {total > 0 && (
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} apiBase={apiBase} agents={agents} onAssigned={() => void load()} />
      <ReviewTaskDialog target={reviewTarget} onClose={() => setReviewTarget(null)} apiBase={apiBase} onReviewed={() => void load()} />
    </div>
  );
}
