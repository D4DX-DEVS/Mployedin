"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Inbox, Pencil, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { RESOURCE_FILE_TYPES } from "@/lib/resources/fileTypes";
import { ResourceCard } from "./ResourceCard";
import { ResourceDetailPanel } from "./ResourceDetailPanel";
import { useResourceDownload } from "./useResourceDownload";
import { RESOURCE_CATEGORY_KEYS, type Resource, type ResourceFile } from "./types";

const SEARCH_DEBOUNCE_MS = 300;

function CardSkeleton() {
  return (
    <div className="workspace-glass-panel flex h-full flex-col gap-4 rounded-2xl p-4 sm:p-5">
      <div className="flex gap-4">
        <Skeleton className="h-20 w-24 rounded-xl sm:w-28" />
        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-3 w-full" /></div>
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2"><Skeleton className="h-9 flex-1 rounded-lg" /><Skeleton className="h-9 flex-1 rounded-lg" /></div>
    </div>
  );
}

/** Admin only: the library plus who can see each resource and its upkeep. */
export interface ResourceManagement {
  accessLabel: (accessLevel: string) => string;
  onEdit: (item: Resource) => void;
  onDelete: (item: Resource) => void;
  onHistory: (item: Resource) => void;
  /** Shown on the empty state, e.g. Add resource. */
  emptyAction?: ReactNode;
}

interface ResourceLibraryProps {
  manage?: ResourceManagement;
  /** Bump to refetch after a create, edit or delete made outside the library. */
  reloadKey?: number;
  /** The figures for the page header. */
  onSummary?: (summary: { total: number; downloads: number }) => void;
}

/**
 * The staff resource library: the same cards, inline filters and detail panel
 * for agent, super agent and admin (client feedback 2026-10-15: the admin page
 * had its own cards and stacked filters). Only admin passes `manage`.
 */
export function ResourceLibrary({ manage, reloadKey = 0, onSummary }: ResourceLibraryProps = {}) {
  const t = useTranslations("resources");
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState("all");
  const [fileType, setFileType] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<{ item: Resource; file?: ResourceFile } | null>(null);

  const categoryLabel = (key: string) =>
    (RESOURCE_CATEGORY_KEYS as readonly string[]).includes(key) ? t(`categories.${key}`) : key;
  const categoryOptions = [
    { value: "all", label: t("categories.all") },
    ...RESOURCE_CATEGORY_KEYS.map((k) => ({ value: k, label: t(`categories.${k}`) })),
  ];
  const fileTypeOptions = [
    { value: "all", label: t("fileTypes.all") },
    ...RESOURCE_FILE_TYPES.map((k) => ({ value: k, label: t(`fileTypes.${k}`) })),
  ];
  const sortOptions = [
    { value: "newest", label: t("sortNewest") },
    { value: "popular", label: t("sortPopular") },
    { value: "a-z", label: t("sortAZ") },
  ];

  useEffect(() => {
    const next = search.trim();
    if (next === debouncedSearch) return;
    const id = setTimeout(() => { setDebouncedSearch(next); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, debouncedSearch]);

  // Every filter change starts again from page 1, in the same render as the
  // change, so the list fetches once (an effect-driven reset fetched twice).
  const withPageReset = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

  // A ref, so an inline callback from the page does not refetch every render.
  const summaryRef = useRef(onSummary);
  useEffect(() => { summaryRef.current = onSummary; });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ sort: sortBy, page: String(page), limit: String(pageSize) });
      if (category !== "all") params.set("category", category);
      if (fileType !== "all") params.set("fileType", fileType);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/resources?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const nextItems: Resource[] = data.items ?? [];
      setItems(nextItems);
      setTotal(data.total ?? 0);
      summaryRef.current?.({ total: data.total ?? 0, downloads: nextItems.reduce((sum, r) => sum + (r.downloadCount ?? 0), 0) });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    // reloadKey is not read: bumping it is how the admin page asks for a refetch.
  }, [category, fileType, sortBy, debouncedSearch, page, pageSize, reloadKey]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Bump the count in place so the card reflects the download without a refetch.
  const { download, pendingKey } = useResourceDownload((id) => {
    const bump = (r: Resource) => (r._id === id ? { ...r, downloadCount: (r.downloadCount ?? 0) + 1 } : r);
    setItems((prev) => prev.map(bump));
    setOpen((prev) => (prev ? { ...prev, item: bump(prev.item) } : prev));
  });

  const filtered = category !== "all" || fileType !== "all" || search !== "" || sortBy !== "newest";
  const clearFilters = () => { setCategory("all"); setFileType("all"); setSearch(""); setSortBy("newest"); setPage(1); };

  return (
    <>
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={filtered ? clearFilters : undefined}
        clearLabel={t("clear")}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
        <SearchableSelect id="resources-category" className={INLINE_FILTER_CONTROL} options={categoryOptions} value={category} onValueChange={withPageReset(setCategory)} placeholder={t("filterCategory")} ariaLabel={t("filterCategory")} />
        <SearchableSelect id="resources-file-type" className={INLINE_FILTER_CONTROL} options={fileTypeOptions} value={fileType} onValueChange={withPageReset(setFileType)} placeholder={t("fileTypeLabel")} ariaLabel={t("fileTypeLabel")} />
        <SearchableSelect id="resources-sort" className={INLINE_FILTER_CONTROL} options={sortOptions} value={sortBy} onValueChange={withPageReset(setSortBy)} placeholder={t("sortLabel")} ariaLabel={t("sortLabel")} />
      </InlineFilterBar>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <ErrorState description={t("fetchError")} onRetry={fetchItems} retryLabel={t("retry")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtered ? t("noResourcesFound") : t("noResources")}
          description={filtered ? t("noMatchesHint") : t("noResourcesHint")}
          action={filtered ? <Button variant="outline" onClick={clearFilters}>{t("clear")}</Button> : manage?.emptyAction}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <ResourceCard
                key={item._id}
                item={item}
                categoryLabel={categoryLabel(item.category)}
                pendingKey={pendingKey}
                onOpen={(i, file) => setOpen({ item: i, file })}
                onDownload={(i, file) => download(i._id, file)}
                accessLabel={manage?.accessLabel(item.accessLevel)}
                manageActions={manage ? (
                  <>
                    <Button variant="ghost" size="sm" className="min-h-11 flex-1 gap-1.5 sm:min-h-9" onClick={() => manage.onEdit(item)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      {t("editResource")}
                    </Button>
                    <Button variant="ghost" size="icon" className="size-11 sm:size-9" onClick={() => manage.onHistory(item)} aria-label={t("a11yDownloadHistory")} title={t("a11yDownloadHistory")}>
                      <Users className="size-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-11 text-destructive hover:text-destructive sm:size-9" onClick={() => manage.onDelete(item)} aria-label={t("a11yDelete")} title={t("a11yDelete")}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : undefined}
              />
            ))}
          </div>
          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            total={total}
            limit={pageSize}
            onPageChange={setPage}
            onLimitChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </>
      )}

      <ResourceDetailPanel
        item={open?.item ?? null}
        initialFile={open?.file}
        categoryLabel={open ? categoryLabel(open.item.category) : ""}
        pendingKey={pendingKey}
        onClose={() => setOpen(null)}
        onDownload={(i, file) => download(i._id, file)}
      />
    </>
  );
}
