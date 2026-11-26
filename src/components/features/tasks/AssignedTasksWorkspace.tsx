"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Clock, Eye, ListChecks, Plus, Undo2, UserRoundPen, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { EmptyState } from "@/components/shared/EmptyState";
import { RowActions } from "@/components/shared/RowActions";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { FilterField, PhoneFilterSheet, PhoneFiltersButton, SHEET_CONTROL } from "@/components/shared/PhoneFilterSheet";
import { usePagination } from "@/hooks/usePagination";
import { useCopilotExecuted } from "@/components/shared/Copilot/events";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { ReviewTaskDialog, type AssignableAgentOption, type ReviewTarget } from "./AssignTaskDialogs";
import { AssignTaskDialog } from "./GiveTaskDialog";
import { GiverActionDialog, type GiverActionTarget } from "./GiverActionDialogs";
import { GroupProgressPanel, type GroupRow, type GroupSummary } from "./GroupProgressPanel";
import { GivenTaskCells, PRIORITY_CLASS } from "./GivenTaskCells";
import { TASK_STATE_CLASS, taskState, taskStateKey } from "./taskState";
import { TaskDetailsPanel, type TaskDetails } from "./TaskDetailsPanel";
import { useInitialLoading } from "@/hooks/useInitialLoading";

type Row = TaskDetails & { group?: GroupSummary };

const EMPTY_STATS = { open: 0, needsYou: 0, overdue: 0, awaitingReview: 0, returned: 0, approved: 0 };
const isOpen = (s: string) => !["completed", "failed", "cancelled"].includes(s);

/**
 * "Tasks I gave": what a super agent gave their team, or an admin gave super
 * agents and agents, and the review of what comes back. A task given to
 * several people is one row with its progress ("2 of 4 done"). The API decides
 * scope and rights from the caller's role; a row the caller may only view
 * (admin's direct task to a super agent's agent) shows no actions.
 */
export function AssignedTasksWorkspace({ audience, tabs }: { audience: "super_agent" | "admin"; tabs?: ReactNode }) {
  const t = useTranslations("assignedTasks");
  const tc = useTranslations("common");
  const apiBase = audience === "admin" ? "/api/admin/agent-tasks" : "/api/super-agent/tasks";
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [agents, setAgents] = useState<AssignableAgentOption[]>([]);
  const [superAgents, setSuperAgents] = useState<AssignableAgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoading = useInitialLoading(loading);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [detailsTask, setDetailsTask] = useState<TaskDetails | null>(null);
  const [groupRow, setGroupRow] = useState<GroupRow | null>(null);
  const [actionTarget, setActionTarget] = useState<GiverActionTarget | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // `review` is what notifications link to (?review=awaiting_review).
  const [review, setReview] = useUrlFilter("review", "all");
  const [status, setStatus] = useUrlFilter("status", "all");
  const [agent, setAgent] = useUrlFilter("agent", "all");
  // Admin: "me" by default (several admins share the pool); super agent: everything they see.
  const defaultGiver = audience === "admin" ? "me" : "all";
  const [giver, setGiver] = useUrlFilter("giver", defaultGiver, { allow: ["me", "all"] });
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), giver });
      if (review !== "all") params.set("review", review);
      if (status !== "all") params.set("status", status);
      if (agent !== "all") params.set("agent", agent);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${apiBase}?${params}`);
      if (!res.ok) { toast.error(t("loadError")); return; }
      const data = await res.json();
      setRows(data.items ?? []);
      setStats({ ...EMPTY_STATS, ...(data.stats ?? {}) });
      updateTotal(data.total ?? 0);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [apiBase, page, limit, review, status, agent, giver, search, updateTotal, t]);

  useEffect(() => { void load(); }, [load]);
  // Given, withdrawn, re-dated or reviewed from the Copilot chat.
  useCopilotExecuted(["give_task", "change_given_task", "review_task_report"], () => void load());
  useEffect(() => { resetPage(); }, [review, status, agent, giver, search, resetPage]);

  // The picker lists: the agents this caller may assign to, and (admin) super agents.
  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}?withAgents=1&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.agents) setAgents(d.agents);
        if (d?.superAgents) setSuperAgents(d.superAgents);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiBase]);

  // Keep an open group panel in step with a reload.
  useEffect(() => {
    if (!groupRow) return;
    const fresh = rows.find((r) => r.group?.id === groupRow.group.id);
    setGroupRow(fresh?.group ? (fresh as GroupRow) : null);
  }, [rows]);  

  const toggle = (setter: (v: string) => void, current: string, value: string) => setter(current === value ? "all" : value);
  const filtered = search.trim() !== "" || review !== "all" || status !== "all" || agent !== "all" || giver !== defaultGiver;
  const clearAll = () => { setSearch(""); setReview("all"); setStatus("all"); setAgent("all"); setGiver(defaultGiver); };
  const cols = audience === "admin" ? 6 : 5;
  const people = [...superAgents, ...agents];
  const agentOptions = [{ value: "all", label: t("filterAllPeople") }, ...people.map((a) => ({ value: a.userId, label: a.name || a.email }))];
  const reviewOptions = [
    { value: "all", label: t("filterAllReview") },
    { value: "awaiting_review", label: t("stateAwaitingReview") },
    { value: "returned", label: t("stateReturned") },
    { value: "approved", label: t("stateApproved") },
  ];
  const giverOptions = [
    { value: "me", label: t("giverMe") },
    { value: "all", label: audience === "admin" ? t("giverAllAdmin") : t("giverAllSuperAgent") },
  ];
  const phoneFilterCount = (agent !== "all" ? 1 : 0) + (review !== "all" ? 1 : 0) + (giver !== defaultGiver ? 1 : 0);

  const candidatesFor = (task: TaskDetails) =>
    (task.assigneeRole === "super_agent" ? superAgents : agents).filter((p) => p.userId !== task.agentUserId);
  const openAction = (action: GiverActionTarget["action"], task: TaskDetails, scope: "one" | "group" = "one", openCount?: number) => {
    setDetailsTask(null);
    setGroupRow(null);
    setActionTarget({
      action,
      taskId: task._id,
      title: task.title,
      personName: task.agentName,
      scope,
      openCount,
      dueDate: task.dueDate,
      ...(action === "reassign" ? { candidates: candidatesFor(task) } : {}),
    });
  };
  const groupOpenCount = (g: GroupSummary) => g.members.filter((m) => isOpen(m.status) && m.canAct !== false).length;

  const taskActions = (task: Row) => {
    const g = task.group;
    if (g) {
      const openCount = groupOpenCount(g);
      return (
        <RowActions
          name={task.title}
          labelsFrom="wide"
          quick={[{ key: "progress", label: g.needsYou > 0 ? t("groupReviewAction", { count: g.needsYou }) : t("groupOpenAction"), icon: Users, onSelect: () => setGroupRow(task as GroupRow) }]}
          menu={openCount > 0 ? [
            { key: "due", label: t("dueGroupAction"), icon: CalendarClock, onSelect: () => openAction("set_due", task, "group", openCount) },
            { key: "withdraw", label: t("withdrawGroupAction"), icon: XCircle, destructive: true, onSelect: () => openAction("withdraw", task, "group", openCount) },
          ] : []}
        />
      );
    }
    const actable = task.canAct !== false && isOpen(task.status);
    return (
      <RowActions
        name={task.title}
        labelsFrom="wide"
        quick={[
          ...(!task.canReview ? [] : [
            { key: "approve", label: task.status === "failed" ? t("acceptFailureAction") : t("approveAction"), icon: CheckCircle2, iconClassName: "text-emerald-600", onSelect: () => setReviewTarget({ id: task._id, title: task.title, agentName: task.agentName, completionNote: task.completionNote, action: "approve" }) },
            { key: "return", label: t("returnAction"), icon: Undo2, iconClassName: "text-amber-600", onSelect: () => setReviewTarget({ id: task._id, title: task.title, agentName: task.agentName, completionNote: task.completionNote, action: "return" }) },
          ]),
          { key: "details", label: t("detailsAction"), icon: Eye, onSelect: () => setDetailsTask(task) },
        ]}
        menu={actable ? [
          { key: "due", label: t("dueAction"), icon: CalendarClock, onSelect: () => openAction("set_due", task) },
          { key: "reassign", label: t("reassignAction"), icon: UserRoundPen, onSelect: () => openAction("reassign", task) },
          { key: "withdraw", label: t("withdrawAction"), icon: XCircle, destructive: true, onSelect: () => openAction("withdraw", task) },
        ] : []}
      />
    );
  };

  const emptyState = (
    <EmptyState
      icon={ClipboardList}
      className="rounded-none border-0 bg-transparent"
      title={filtered ? t("noResultsTitle") : t("emptyTitle")}
      description={filtered ? t("noResultsDescription") : t("emptyDescription")}
      action={filtered
        ? <Button variant="outline" size="sm" onClick={clearAll}>{tc("clearAllFilters")}</Button>
        : <Button size="sm" onClick={() => setAssignOpen(true)}>{t("assignButton")}</Button>}
    />
  );

  const filterControls = (sheet: boolean) => {
    const cls = sheet ? SHEET_CONTROL : INLINE_FILTER_CONTROL;
    const controls = [
      { id: "giver", label: t("fieldGiver"), options: giverOptions, value: giver, set: setGiver },
      { id: "agent", label: t("fieldPerson"), options: agentOptions, value: agent, set: setAgent },
      { id: "review", label: t("columnState"), options: reviewOptions, value: review, set: setReview },
    ];
    return controls.map((c) => sheet ? (
      <FilterField key={c.id} label={c.label} htmlFor={`given-sheet-${c.id}`}>
        <SearchableSelect id={`given-sheet-${c.id}`} options={c.options} value={c.value} onValueChange={c.set} className={cls} />
      </FilterField>
    ) : (
      <SearchableSelect key={c.id} options={c.options} value={c.value} onValueChange={c.set} ariaLabel={c.label} className={cls} />
    ));
  };

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
          { label: t("metricNeedsYou"), value: stats.needsYou, icon: ListChecks, tone: "warning", onClick: () => toggle(setReview, review, "awaiting_review"), active: review === "awaiting_review" },
          { label: t("metricOverdue"), value: stats.overdue, icon: AlertCircle, tone: "danger", onClick: () => toggle(setStatus, status, "overdue"), active: status === "overdue" },
          { label: t("metricReturned"), value: stats.returned, icon: Undo2, tone: "info", onClick: () => toggle(setReview, review, "returned"), active: review === "returned" },
        ]}
      />

      {tabs}

      <InlineFilterBar className="workspace-panel-surface rounded-2xl border-b-0 max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none" onClear={filtered ? clearAll : undefined}>
        <InlineFilterSearch busy={loading && !initialLoading} value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
        <PhoneFiltersButton activeCount={phoneFilterCount} onClick={() => setFilterSheetOpen(true)} />
        <div className="contents max-sm:hidden">{filterControls(false)}</div>
      </InlineFilterBar>

      <PhoneFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        activeCount={phoneFilterCount}
        onClear={() => { setAgent("all"); setReview("all"); setGiver(defaultGiver); }}
      >
        {filterControls(true)}
      </PhoneFilterSheet>

      <PhoneRecordList
        className="sm:hidden"
        label={audience === "admin" ? t("adminTitle") : t("superAgentTitle")}
        loading={initialLoading}
        empty={emptyState}
        items={rows.map((task) => {
          const state = taskState(task);
          return {
            key: `given-task-${task._id}`,
            title: task.title,
            subtitle: task.group ? t("groupPeople", { count: task.group.size }) : task.agentName || "—",
            trailing: task.group
              ? <span className="whitespace-nowrap text-xs font-semibold">{t("groupProgress", { done: task.group.done, total: task.group.size - task.group.withdrawn })}</span>
              : <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TASK_STATE_CLASS[state]}`}>{t(taskStateKey(state))}</span>,
            actions: taskActions(task),
            meta: <GivenTaskCells.Meta task={task} audience={audience} />,
            badges: (
              <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[task.priority]}`}>
                {task.priority === "high" ? t("priorityHigh") : task.priority === "low" ? t("priorityLow") : t("priorityMedium")}
              </span>
            ),
          };
        })}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl max-sm:hidden">
        <div className="overflow-x-auto">
          <Table data-mobile-table="scroll">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[240px]">{t("columnTask")}</TableHead>
                <TableHead>{t("columnGivenTo")}</TableHead>
                {audience === "admin" && <TableHead>{t("columnAssignedBy")}</TableHead>}
                <TableHead>{t("columnState")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("columnDue")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLoading ? (
                <TableBodySkeleton rows={5} cols={cols} />
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={cols} className="p-0">{emptyState}</TableCell>
                </TableRow>
              ) : rows.map((task) => (
                <TableRow key={task._id} className={task.status === "cancelled" && !task.group ? "opacity-60" : undefined}>
                  <GivenTaskCells.Row task={task} audience={audience} />
                  <TableCell className="text-right">{taskActions(task)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {total > 0 && (
        <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
      )}

      <AssignTaskDialog open={assignOpen} onOpenChange={setAssignOpen} apiBase={apiBase} agents={agents} superAgents={audience === "admin" ? superAgents : undefined} onAssigned={() => void load()} />
      <ReviewTaskDialog target={reviewTarget} onClose={() => setReviewTarget(null)} apiBase={apiBase} onReviewed={() => void load()} />
      <TaskDetailsPanel
        task={detailsTask}
        apiBase={apiBase}
        onClose={() => setDetailsTask(null)}
        onReviewed={() => void load()}
        onWithdraw={(task) => openAction("withdraw", task)}
        onReassign={(task) => openAction("reassign", task)}
        onChangeDue={(task) => openAction("set_due", task)}
      />
      <GroupProgressPanel
        row={groupRow}
        onClose={() => setGroupRow(null)}
        onOpenMember={(m) => { setGroupRow(null); setDetailsTask(m); }}
        onWithdrawAll={(r) => openAction("withdraw", r, "group", groupOpenCount(r.group))}
        onChangeDueAll={(r) => openAction("set_due", r, "group", groupOpenCount(r.group))}
      />
      <GiverActionDialog target={actionTarget} apiBase={apiBase} onClose={() => setActionTarget(null)} onDone={() => void load()} />
    </div>
  );
}
