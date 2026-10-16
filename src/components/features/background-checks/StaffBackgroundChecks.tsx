"use client";

/**
 * Background checks of the employers an agent or super agent works with
 * (client report 2026-09-30). Agents run them too (owner decision 2026-10-14):
 * Start takes a check nobody holds, and the panel records progress and the
 * verdict. Super agents and admins follow. Scoping and what each row allows
 * come from the API (GET /api/background-checks, `viewer` per row).
 * An agent can work with many employers, so the list has summary tiles and
 * filters by employer -> job, status, check type and holder (all in the URL).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Eye, Info, Loader2, Play, ShieldCheck } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatListDate } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";
import { CheckDetailPanel } from "./CheckDetailPanel";
import { KNOWN_ERROR_CODES, type CheckViewer } from "./checkDetailTypes";
import {
  FILTER_HOLDERS,
  FILTER_STATUSES,
  FILTER_TYPES,
  StaffCheckFilterBar,
  StaffCheckTiles,
  type CheckOverview,
  type StaffCheckFilterValues,
} from "./StaffCheckFilters";

const STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
type CheckStatus = (typeof STATUSES)[number];
const OUTCOMES = ["clear", "flagged", "failed", "unable_to_verify", "pending"] as const;
const TYPES = ["background", "reference", "both"] as const;

export interface StaffBackgroundCheck {
  _id: string;
  status: CheckStatus;
  outcome?: string;
  checkType?: string;
  requestedAt?: string;
  completedAt?: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  references: { total: number; responded: number; declined: number };
  assignee: { name: string; kind: "agent" | "employer"; isMe: boolean } | null;
  viewer: CheckViewer;
}

type RowAction = "start" | "continue" | "review" | "result" | "progress" | "view";

/** What the row's button does, from where the check stands and what this viewer may do. */
function rowAction(check: StaffBackgroundCheck): RowAction {
  if (check.viewer?.canStart) return "start";
  if (check.viewer?.canWork) return "continue";
  if (check.status === "completed") return check.outcome === "clear" ? "result" : "review";
  // Someone else is running it: the viewer can follow, not act.
  if (check.status === "in_progress" || check.viewer?.heldByOther) return "progress";
  return "view";
}
const actionLabelKey = (action: RowAction) => (action === "progress" ? "rowActionProgress" : `rowAction.${action}`);

const STATUS_TONE: Record<CheckStatus, string> = {
  pending: "border-border bg-muted/40 text-muted-foreground",
  in_progress: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  cancelled: "border-border bg-muted/40 text-muted-foreground",
};
const OUTCOME_TONE: Record<string, string> = {
  clear: "text-emerald-700",
  flagged: "text-amber-700",
  failed: "text-rose-700",
  unable_to_verify: "text-amber-700",
  pending: "text-muted-foreground",
};

const COLUMNS = 6;

export function StaffBackgroundChecks() {
  const t = useTranslations("staffBackgroundChecks");
  const tWork = useTranslations("backgroundCheckWork");
  const locale = useLocale();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage, paginationParams } = usePagination();
  const [status, setStatus] = useUrlFilter("status", "all", { allow: ["all", ...FILTER_STATUSES] });
  const [checkType, setCheckType] = useUrlFilter("checkType", "all", { allow: ["all", ...FILTER_TYPES] });
  const [holder, setHolder] = useUrlFilter("holder", "all", { allow: ["all", ...FILTER_HOLDERS] });
  const [employerId, setEmployerId] = useUrlFilter("employerId", "");
  const [jobId, setJobId] = useUrlFilter("jobId", "");
  const [q, setQ] = useUrlFilter("q", "", { debounceMs: 300 });
  const [overview, setOverview] = useState<CheckOverview | null>(null);
  const [items, setItems] = useState<StaffBackgroundCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // `?checkId=` opens one check — the assignment notification links here.
  const [openId, setOpenId] = useUrlFilter("checkId", "");
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const params = paginationParams();
    if (status !== "all") params.set("status", status);
    if (checkType !== "all") params.set("checkType", checkType);
    if (holder !== "all") params.set("holder", holder);
    if (employerId) params.set("employerId", employerId);
    if (jobId) params.set("jobId", jobId);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/background-checks?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: StaffBackgroundCheck[]; total?: number };
      setItems(data.items ?? []);
      updateTotal(data.total ?? 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
    // paginationParams changes with page/limit only; the pagination object itself would loop.
  }, [paginationParams, status, checkType, holder, employerId, jobId, q, updateTotal]);

  useEffect(() => { void load(); }, [load]);

  /** Tile counts and the Employer -> Job options; refreshed after any change to a check. */
  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/background-checks/overview");
      const data = res.ok ? ((await res.json()) as Partial<CheckOverview>) : null;
      if (data?.counts) setOverview({ canRun: !!data.canRun, counts: data.counts, employers: data.employers ?? [], jobs: data.jobs ?? [] });
    } catch {
      // The tiles keep their last counts; the list itself still works.
    }
  }, []);
  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const refresh = useCallback(() => {
    void load();
    void loadOverview();
  }, [load, loadOverview]);

  const filters: StaffCheckFilterValues = { q, status, checkType, holder, employerId, jobId };
  const filtered = status !== "all" || checkType !== "all" || holder !== "all" || !!employerId || !!jobId || !!q.trim();
  const setters: Record<keyof StaffCheckFilterValues, (value: string) => void> = {
    q: setQ, status: setStatus, checkType: setCheckType, holder: setHolder, employerId: setEmployerId, jobId: setJobId,
  };
  const changeFilters = (patch: Partial<StaffCheckFilterValues>) => {
    (Object.keys(patch) as (keyof StaffCheckFilterValues)[]).forEach((key) => setters[key](patch[key] ?? ""));
    resetPage();
  };
  const clearFilters = () =>
    changeFilters({ q: "", status: "all", checkType: "all", holder: "all", employerId: "", jobId: "" });

  /** Start takes the check, then opens it to work on. */
  const start = async (id: string) => {
    setStarting(id);
    try {
      const res = await csrfFetch(`/api/background-checks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        const code = (KNOWN_ERROR_CODES as readonly string[]).includes(body.code ?? "") ? body.code : null;
        toast.error(code ? tWork(`errors.${code}`) : tWork("errors.generic"));
        refresh();
        return;
      }
      toast.success(tWork("started"));
      refresh();
      setOpenId(id);
    } catch {
      toast.error(tWork("errors.generic"));
    } finally {
      setStarting(null);
    }
  };

  const actionButton = (check: StaffBackgroundCheck, className?: string) => {
    const action = rowAction(check);
    return (
      <Button
        type="button"
        size="sm"
        variant={action === "start" ? "default" : "outline"}
        className={cn("min-h-11 rounded-lg sm:min-h-9", className)}
        disabled={starting !== null}
        aria-label={`${tWork(actionLabelKey(action))} · ${check.candidateName || t("unknownCandidate")}`}
        onClick={() => (action === "start" ? void start(check._id) : setOpenId(check._id))}
      >
        {starting === check._id ? (
          <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : action === "start" ? (
          <Play className="me-1.5 h-4 w-4" aria-hidden="true" />
        ) : action === "continue" ? (
          <ArrowRight className="me-1.5 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        ) : (
          <Eye className="me-1.5 h-4 w-4" aria-hidden="true" />
        )}
        {tWork(actionLabelKey(action))}
      </Button>
    );
  };

  const handledBy = (check: StaffBackgroundCheck) =>
    check.assignee ? (
      <span className="block text-xs text-muted-foreground">
        {check.assignee.isMe
          ? tWork("handledByYou")
          : tWork("handledByName", { name: check.assignee.name, kind: tWork(check.assignee.kind === "agent" ? "kindAgent" : "kindTeam") })}
      </span>
    ) : null;

  const label = {
    status: (value: string) => ((STATUSES as readonly string[]).includes(value) ? t(`status.${value}`) : value),
    outcome: (value?: string) => ((OUTCOMES as readonly string[]).includes(value ?? "") ? t(`outcome.${value}`) : ""),
    type: (value?: string) => ((TYPES as readonly string[]).includes(value ?? "") ? t(`type.${value}`) : ""),
  };
  const date = (value?: string) => formatListDate(value, locale);
  const referencesLine = (check: StaffBackgroundCheck) =>
    check.references.total > 0 ? t("references", { responded: check.references.responded, total: check.references.total }) : null;

  const statusBadge = (check: StaffBackgroundCheck) => (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[check.status] ?? STATUS_TONE.pending)}>
      {label.status(check.status)}
    </span>
  );
  const outcomeText = (check: StaffBackgroundCheck) => {
    const text = label.outcome(check.outcome);
    return text ? <span className={cn("text-xs font-medium", OUTCOME_TONE[check.outcome ?? "pending"])}>{text}</span> : null;
  };

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("pageTitle")} context={t("pageContext", { count: total })} />

      <StaffCheckTiles overview={overview} values={filters} onPick={changeFilters} />

      <section className="workspace-panel-surface rounded-3xl panel-body">
        <p className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {tWork("workNote")}
        </p>
        <StaffCheckFilterBar overview={overview} values={filters} onChange={changeFilters} onClear={clearFilters} active={filtered} />

        {failed ? (
          <ErrorState className="mt-4" title={t("loadErrorTitle")} onRetry={() => void load()} />
        ) : !loading && items.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={ShieldCheck}
            title={filtered ? t("emptyFiltersTitle") : t("emptyTitle")}
            description={filtered ? t("emptyFiltersDescription") : t("emptyDescription")}
            action={filtered ? <Button variant="outline" onClick={clearFilters}>{t("clearFilters")}</Button> : undefined}
          />
        ) : (
          <>
            {/* Phones: one card per check — five columns don't fit 375px. */}
            <ul className="mt-4 space-y-3 sm:hidden" aria-busy={loading}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
                  ))
                : items.map((check) => (
                    <li key={check._id} className="rounded-2xl border border-border bg-background/70 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium text-foreground">{check.candidateName || t("unknownCandidate")}</p>
                        {statusBadge(check)}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-foreground/90">{check.companyName || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{check.jobTitle || "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{label.type(check.checkType)}</span>
                        {outcomeText(check)}
                        {referencesLine(check) ? <span>{referencesLine(check)}</span> : null}
                        <span>{date(check.requestedAt)}</span>
                      </div>
                      {handledBy(check)}
                      {actionButton(check, "mt-3 w-full")}
                    </li>
                  ))}
            </ul>

            <div className="workspace-subtle-surface mt-4 hidden overflow-x-auto rounded-3xl sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
                    <TableHead>{t("colCandidate")}</TableHead>
                    <TableHead>{t("colEmployerJob")}</TableHead>
                    <TableHead>{t("colCheck")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("colRequested")}</TableHead>
                    <TableHead className="text-end">{tWork("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy={loading}>
                  {loading
                    ? Array.from({ length: Math.min(limit, 10) }).map((_, i) => (
                        <TableRow key={i} className="hover:bg-transparent">
                          {Array.from({ length: COLUMNS }).map((__, j) => (
                            <TableCell key={j} className={j === COLUMNS - 2 ? "hidden md:table-cell" : undefined}>
                              <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : items.map((check) => (
                        <TableRow key={check._id} className="hover:bg-secondary/50">
                          <TableCell className="font-medium text-foreground">{check.candidateName || t("unknownCandidate")}</TableCell>
                          <TableCell>
                            {/* Employer first: an agent scans the list by who asked. */}
                            <span className="block font-medium text-foreground/90">{check.companyName || "—"}</span>
                            <span className="block text-xs text-muted-foreground">{check.jobTitle || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <span className="block text-sm text-foreground/80">{label.type(check.checkType)}</span>
                            {referencesLine(check) ? <span className="block text-xs text-muted-foreground">{referencesLine(check)}</span> : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              {statusBadge(check)}
                              {outcomeText(check)}
                              {handledBy(check)}
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{date(check.requestedAt)}</TableCell>
                          <TableCell className="text-end">{actionButton(check)}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CheckDetailPanel apiBase="/api/background-checks" checkId={openId || null} onClose={() => setOpenId("")} onChanged={refresh} />
    </div>
  );
}
