"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { useConfirm } from "@/hooks/useConfirm";
import { useDebounce } from "@/hooks/useDebounce";
import { usePagination } from "@/hooks/usePagination";
import type { RegionConflict } from "@/lib/superAgent/regions";
import type { TerritoryRow, TerritorySuperAgentOption } from "@/lib/superAgent/territories";
import { TerritoryDialog, type TerritoryFormValues } from "./_components/TerritoryDialog";

const HEAD = "px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]";
const VISIBLE_REGIONS = 3;

interface SaveResponse {
  error?: string;
  trimmedAgents?: number;
  warnings?: { type: string; conflicts: RegionConflict[] }[];
}

/**
 * Admin → Territories. Each row is a super agent's territory: its name, the
 * super agent, and the places it covers — the same region the super agent sees
 * on their dashboard, profile and Territory page, and that routes leads to them.
 */
export default function AdminTerritoryPage() {
  const t = useTranslations("adminTerritory");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination(20);
  const { confirm, ConfirmDialogNode } = useConfirm();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [superAgents, setSuperAgents] = useState<TerritorySuperAgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TerritoryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState("superAgent");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  /** Same column flips it; a new name column starts A–Z, agent count highest first. */
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder(field === "agentCount" ? "desc" : "asc"); }
    resetPage();
  };

  const fetchTerritories = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), locale });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/territories?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(data.items ?? []);
      setSuperAgents(data.superAgents ?? []);
      updateTotal(data.total ?? 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, limit, locale, debouncedSearch, sortBy, sortOrder, updateTotal]);

  useEffect(() => { void fetchTerritories(); }, [fetchTerritories]);

  const openCreate = () => { setEditing(null); setSaveError(null); setDialogOpen(true); };
  const openEdit = (row: TerritoryRow) => { setEditing(row); setSaveError(null); setDialogOpen(true); };

  const reportSave = (body: SaveResponse, doneMessage: string) => {
    toast.success(doneMessage);
    const conflicts = body.warnings?.flatMap((w) => w.conflicts) ?? [];
    if (conflicts.length > 0) {
      toast.warning(t("toastOverlap", { names: conflicts.map((c) => c.superAgentName).join(", ") }));
    }
    if (body.trimmedAgents) toast.info(t("toastAgentsTrimmed", { count: body.trimmedAgents }));
  };

  const save = async (values: TerritoryFormValues) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = editing?.territoryId
        ? await fetch(`/api/admin/territories/${editing.territoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          })
        : await fetch("/api/admin/territories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
      const body: SaveResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(body.error ?? t("toastSaveFailed"));
        return;
      }
      setDialogOpen(false);
      reportSave(body, editing?.territoryId ? t("toastTerritoryUpdated") : t("toastTerritoryCreated"));
      void fetchTerritories();
    } catch {
      setSaveError(t("toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: TerritoryRow) => {
    if (!row.territoryId) return;
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: row.name ?? "" }),
      message: row.superAgent
        ? t("deleteConfirmMessage", { superAgent: row.superAgent.name })
        : t("deleteConfirmMessageUnowned"),
      confirmLabel: t("deleteButtonLabel"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/territories/${row.territoryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t("toastTerritoryDeleted"));
      void fetchTerritories();
    } catch {
      toast.error(t("toastDeleteFailed"));
    }
  };

  const rowActionsFor = (row: TerritoryRow): { quick: RowAction[]; menu: RowAction[] } => ({
    quick: [{
      key: "edit",
      label: row.territoryId ? t("editButtonTitle") : t("nameButtonTitle"),
      icon: Pencil,
      iconOnly: true,
      onSelect: () => openEdit(row),
    }],
    menu: row.territoryId
      ? [{ key: "delete", label: t("deleteButtonTitle"), icon: Trash2, iconOnly: true, destructive: true, onSelect: () => void remove(row) }]
      : [],
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <PageHero
        compact
        compactOnMobile
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={
          <Button onClick={openCreate} size="sm" className="h-9 rounded-xl shadow-sm">
            <Plus className="h-4 w-4" />
            {t("newTerritoryButtonLabel")}
          </Button>
        }
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search ? () => { setSearch(""); resetPage(); } : undefined}
        clearLabel={t("clearSearch")}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <TableSortControl
          value={sortBy}
          onValueChange={(value) => { setSortBy(value); resetPage(); }}
          options={[
            { value: "superAgent", label: t("columnSuperAgent") },
            { value: "name", label: t("columnTerritory") },
            { value: "agentCount", label: t("columnAgents") },
          ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl border-t-0 rounded-t-none">
        {loadError ? (
          <div className="p-6">
            <ErrorState onRetry={() => void fetchTerritories()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className={`min-w-[160px] ${HEAD}`}>
                    <SortableTableHeader label={t("columnTerritory")} active={sortBy === "name"} order={sortOrder} onClick={() => sortByColumn("name")} />
                  </TableHead>
                  <TableHead className={`min-w-[200px] ${HEAD}`}>
                    <SortableTableHeader label={t("columnSuperAgent")} active={sortBy === "superAgent"} order={sortOrder} onClick={() => sortByColumn("superAgent")} />
                  </TableHead>
                  <TableHead className={`min-w-[220px] ${HEAD}`}>{t("columnRegion")}</TableHead>
                  <TableHead className={`w-[90px] text-center ${HEAD}`}>
                    <SortableTableHeader label={t("columnAgents")} active={sortBy === "agentCount"} order={sortOrder} onClick={() => sortByColumn("agentCount")} />
                  </TableHead>
                  <TableHead className={`w-[120px] text-right ${HEAD}`}>{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={4} cols={5} />
                ) : rows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={MapPin}
                        title={search ? t("emptySearchTitle") : t("emptyStateTitle")}
                        description={search ? t("emptySearchDescription") : t("emptyStateDescription")}
                        action={
                          search ? (
                            <Button variant="outline" size="sm" onClick={() => { setSearch(""); resetPage(); }}>
                              {t("clearSearch")}
                            </Button>
                          ) : (
                            <Button size="sm" onClick={openCreate}>
                              <Plus className="h-4 w-4" />
                              {t("newTerritoryButtonLabel")}
                            </Button>
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const shown = row.regions.slice(0, VISIBLE_REGIONS);
                    const hidden = row.regions.slice(VISIBLE_REGIONS);
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="px-4 py-3">
                          {row.name ? (
                            <span className="font-medium text-foreground">{row.name}</span>
                          ) : (
                            <span className="text-sm italic text-muted-foreground">{t("unnamedTerritory")}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {row.superAgent ? (
                            <div className="flex min-w-0 items-center gap-3">
                              <UserAvatar
                                name={row.superAgent.name}
                                email={row.superAgent.email}
                                src={row.superAgent.avatar}
                                className="h-9 w-9"
                                colorful
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">{row.superAgent.name}</p>
                                <p className="max-w-[14rem] truncate text-xs text-muted-foreground">{row.superAgent.email}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sm text-amber-800">
                              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                              {t("noSuperAgent")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {row.regions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {shown.map((region) => (
                                <span
                                  key={region.id}
                                  title={region.parent ? `${region.name}, ${region.parent}` : region.name}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
                                >
                                  <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                  {region.name}
                                </span>
                              ))}
                              {hidden.length > 0 && (
                                <span
                                  title={hidden.map((r) => r.name).join(", ")}
                                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                >
                                  {t("moreRegions", { count: hidden.length })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("noRegion")}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            {row.agentCount}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <RowActions
                            name={row.name ?? row.superAgent?.name ?? t("unnamedTerritory")}
                            {...rowActionsFor(row)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      <TerritoryDialog
        open={dialogOpen}
        row={editing}
        superAgents={superAgents}
        saving={saving}
        error={saveError}
        onOpenChange={setDialogOpen}
        onSubmit={(values) => void save(values)}
      />
    </div>
  );
}
