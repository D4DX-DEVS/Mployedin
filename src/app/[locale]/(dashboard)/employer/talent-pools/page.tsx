"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/useConfirm";
import { useDebounce } from "@/hooks/useDebounce";
import RelativeDate from "@/components/shared/RelativeDate";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import {
  Layers,
  Loader2,
  Plus,
  Trash2,
  Users,
  ExternalLink,
  Tag,
  Search,
  Pencil,
  UserPlus,
  X,
} from "lucide-react";
import {
  useTalentPools,
  useTalentPool,
  useCreatePool,
  useUpdatePool,
  useDeletePool,
  useAddCandidateToPool,
  useRemoveCandidateFromPool,
  type TalentPool,
  type TalentPoolSource,
  type PooledCandidate,
  type PooledCandidateRef,
} from "@/hooks/useTalentPools";
import { useCandidates } from "@/hooks/useCandidates";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function refOf(candidate: PooledCandidate): PooledCandidateRef | null {
  return candidate.jobSeekerId && typeof candidate.jobSeekerId === "object" ? candidate.jobSeekerId : null;
}

const POOL_COLORS = [
  { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
  { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
  { bg: "bg-pink-50", text: "text-pink-600", ring: "ring-pink-100" },
  { bg: "bg-teal-50", text: "text-teal-600", ring: "ring-teal-100" },
];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return POOL_COLORS[hash % POOL_COLORS.length];
}

const SOURCE_BADGE_CLASS: Record<TalentPoolSource, string> = {
  manual: "bg-sky-100 text-sky-700 border-sky-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  withdrawn: "bg-amber-100 text-amber-700 border-amber-200",
  expired: "bg-gray-100 text-gray-700 border-gray-200",
};

function candidateLabel(ref: PooledCandidateRef | null): string {
  return ref?.fullName || ref?.userId?.name || ref?.userId?.email || "—";
}

function CandidateAvatar({ ref, size = "sm" }: { ref: PooledCandidateRef | null; size?: "sm" | "xs" }) {
  const dims = size === "xs" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  const avatar = ref?.userId?.avatar;
  const label = candidateLabel(ref);
  const initials = label !== "—" ? label.slice(0, 2).toUpperCase() : "?";
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={label} className={`${dims} rounded-full border-2 border-background object-cover`} />;
  }
  return (
    <div className={`${dims} flex items-center justify-center rounded-full border-2 border-background bg-muted font-semibold text-muted-foreground`}>
      {initials}
    </div>
  );
}

type SortKey = "updated" | "newest" | "count" | "name";

export default function EmployerTalentPoolsPage() {
  const t = useTranslations("talentPool");
  const { data: pools = [], isLoading, isError } = useTalentPools();
  const [createOpen, setCreateOpen] = useState(false);
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [renamingPool, setRenamingPool] = useState<TalentPool | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("updated");

  const deletePool = useDeletePool();
  const { confirm, ConfirmDialogNode } = useConfirm();

  async function handleDeletePool(pool: TalentPool) {
    const ok = await confirm({ message: t("deletePoolConfirm"), variant: "destructive", confirmLabel: t("delete") });
    if (!ok) return;
    try {
      await deletePool.mutateAsync(pool._id);
      toast.success(t("archived"));
      if (activePoolId === pool._id) setActivePoolId(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const stats = useMemo(() => {
    const totalCandidates = pools.reduce((sum, p) => sum + (p.candidates?.length ?? 0), 0);
    const now = new Date();
    const addedThisMonth = pools.reduce((sum, p) => {
      const monthCount = (p.candidates ?? []).filter((c) => {
        const d = new Date(c.addedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
      return sum + monthCount;
    }, 0);
    return { totalPools: pools.length, totalCandidates, addedThisMonth };
  }, [pools]);

  const visiblePools = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? pools.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.tags?.some((tag) => tag.toLowerCase().includes(q)))
      : pools;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "count") return (b.candidates?.length ?? 0) - (a.candidates?.length ?? 0);
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return sorted;
  }, [pools, search, sortBy]);

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <DashboardPageHeader
        inlineActions
        icon={Layers}
        eyebrow={t("title")}
        title={t("title")}
        description={t("subtitle")}
        actions={pools.length > 0 ? (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            {t("createPool")}
          </Button>
        ) : undefined}
        metrics={pools.length > 0 ? [
          { label: t("statPools"), value: stats.totalPools, icon: Layers },
          { label: t("statCandidates"), value: stats.totalCandidates, icon: Users },
          { label: t("statAddedThisMonth"), value: stats.addedThisMonth, icon: Plus },
        ] : undefined}
      />

      {pools.length > 0 && (
        <section className="workspace-panel-surface rounded-2xl panel-body">
          {/* Search + sort share one row on phones too. */}
          <div className="flex flex-row items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("searchPools")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-[10.5rem] shrink-0 sm:w-[200px]" aria-label={t("sortBy")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">{t("sortRecentlyUpdated")}</SelectItem>
                <SelectItem value="newest">{t("sortNewest")}</SelectItem>
                <SelectItem value="count">{t("sortMostCandidates")}</SelectItem>
                <SelectItem value="name">{t("sortAlphabetical")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </div>
      ) : pools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-4 text-sm font-medium text-foreground">{t("noPoolsTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noPools")}</p>
          <Button onClick={() => setCreateOpen(true)} className="mt-5">
            <Plus className="mr-2 h-4 w-4" />
            {t("createPool")}
          </Button>
        </div>
      ) : visiblePools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("noSearchResults")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePools.map((pool) => (
            <PoolCard
              key={pool._id}
              pool={pool}
              onOpen={() => setActivePoolId(pool._id)}
              onRename={() => setRenamingPool(pool)}
              onDelete={() => handleDeletePool(pool)}
            />
          ))}
        </div>
      )}

      <CreatePoolDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenamePoolDialog pool={renamingPool} onClose={() => setRenamingPool(null)} />
      <PoolDetailDialog
        poolId={activePoolId}
        onClose={() => setActivePoolId(null)}
        onRename={(pool) => setRenamingPool(pool)}
        onDelete={handleDeletePool}
      />
    </div>
  );
}

function PoolCard({
  pool, onOpen, onRename, onDelete,
}: { pool: TalentPool; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const t = useTranslations("talentPool");
  const count = pool.candidates?.length ?? 0;
  const color = colorFor(pool._id);

  return (
    <div className="group relative flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 transition hover:border-sky-300 hover:shadow-md sm:p-4">
      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("edit")}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          title={t("delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color.bg} ring-4 ${color.ring}`}>
            <Layers className={`h-5 w-5 ${color.text}`} />
          </div>
          <div className="min-w-0 pr-10">
            <h3 className="text-base font-semibold text-foreground line-clamp-1">{pool.name}</h3>
            {pool.description ? (
              <p className="line-clamp-1 text-sm text-muted-foreground">{pool.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("candidateCount", { count })}</p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground [&>*]:shrink-0">
          <Users className="h-3.5 w-3.5" aria-hidden />
          <span className="font-medium text-foreground">{t("candidateCount", { count })}</span>
          <span aria-hidden>·</span>
          <RelativeDate date={pool.updatedAt} prefix={t("updatedPrefix")} />
          {pool.tags?.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[11px]">
              {tag}
            </Badge>
          ))}
        </div>
      </button>
    </div>
  );
}

function CreatePoolDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("talentPool");
  const createPool = useCreatePool();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  function reset() {
    setName("");
    setDescription("");
    setTags("");
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    try {
      await createPool.mutateAsync({ name: trimmed, description: description.trim(), tags: parseTags(tags) });
      toast.success(t("poolCreated"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("createPool")}</DialogTitle>
          <DialogDescription className="sr-only">{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pool-name">{t("poolName")}</Label>
            <Input
              id="pool-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("poolNamePlaceholder")}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pool-description">{t("description")}</Label>
            <Textarea
              id="pool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pool-tags">{t("tags")}</Label>
            <Input
              id="pool-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t("tagsPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createPool.isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={createPool.isPending}>
            {createPool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenamePoolDialog({ pool, onClose }: { pool: TalentPool | null; onClose: () => void }) {
  const t = useTranslations("talentPool");
  const updatePool = useUpdatePool();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (pool) {
      setName(pool.name);
      setDescription(pool.description ?? "");
    }
  }, [pool]);

  async function handleSave() {
    if (!pool || !name.trim()) return;
    try {
      await updatePool.mutateAsync({ id: pool._id, name: name.trim(), description: description.trim() });
      toast.success(t("poolUpdated"));
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={!!pool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("edit")} {pool?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-pool-name">{t("poolName")}</Label>
            <Input id="rename-pool-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rename-pool-description">{t("description")}</Label>
            <Textarea id="rename-pool-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updatePool.isPending}>{t("cancel")}</Button>
          <Button onClick={handleSave} disabled={updatePool.isPending || !name.trim()}>
            {updatePool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCandidateSection({ pool, onDone }: { pool: TalentPool; onDone: () => void }) {
  const t = useTranslations("talentPool");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debouncedQuery = useDebounce(query, 300);
  const { data, isFetching } = useCandidates({ page, limit, search: debouncedQuery });
  const addCandidate = useAddCandidateToPool();
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  useEffect(() => { setPage(1); }, [debouncedQuery]);

  const existingIds = new Set((pool.candidates ?? []).map((c) => refOf(c)?._id ?? (typeof c.jobSeekerId === "string" ? c.jobSeekerId : "")));
  const results = (data?.candidates ?? []).filter((c) => !existingIds.has(c._id));
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const allOnPageSelected = results.length > 0 && results.every((c) => selected.has(c._id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) results.forEach((c) => next.delete(c._id));
      else results.forEach((c) => next.add(c._id));
      return next;
    });
  }

  async function handleAdd(jobSeekerId: string) {
    try {
      await addCandidate.mutateAsync({ poolId: pool._id, jobSeekerId, source: "manual" });
      toast.success(t("addedToPool"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleBulkAdd() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkSubmitting(true);
    try {
      const results2 = await Promise.allSettled(
        ids.map((id) => addCandidate.mutateAsync({ poolId: pool._id, jobSeekerId: id, source: "manual" }))
      );
      let added = 0;
      let skipped = 0;
      let failed = 0;
      for (const r of results2) {
        if (r.status === "fulfilled") added++;
        else if ((r.reason as { status?: number } | undefined)?.status === 409) skipped++;
        else failed++;
      }
      if (added > 0 && skipped === 0 && failed === 0) toast.success(t("bulkAddedToPool", { count: added }));
      else if (added > 0) toast.success(t("bulkAddedPartial", { added, skipped: skipped + failed }));
      else if (skipped > 0 && failed === 0) toast(t("bulkAlreadyInPool"));
      else toast.error(t("bulkAddFailed"));
      setSelected(new Set());
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-border bg-muted/20 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{t("addCandidate")}</p>
        <button type="button" onClick={onDone} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchCandidatesPlaceholder")}
          className="pl-9"
        />
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground">{t("selectedCount", { count: selected.size })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkSubmitting}>
              {t("clearSelection")}
            </Button>
            <Button size="sm" onClick={handleBulkAdd} disabled={bulkSubmitting}>
              {bulkSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {t("saveSelectedToPool", { count: selected.size })}
            </Button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <label className="mt-3 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-3.5 w-3.5 rounded border-border" />
          {t("selectAllOnPage")}
        </label>
      )}

      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
        {isFetching ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("noSearchResults")}</p>
        ) : (
          results.map((c) => (
            <div key={c._id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
              <input
                type="checkbox"
                checked={selected.has(c._id)}
                onChange={() => toggle(c._id)}
                className="h-3.5 w-3.5 shrink-0 rounded border-border"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.fullName || c.userId?.name || c.userId?.email}</p>
                {c.currentLocation ? <p className="truncate text-xs text-muted-foreground">{c.currentLocation}</p> : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => handleAdd(c._id)}
                disabled={addCandidate.isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("addCandidate")}
              </Button>
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => { setLimit(l); setPage(1); }}
          className="mt-3 border-t border-border/50 pt-3 text-[11px]"
        />
      )}
    </div>
  );
}

function PoolDetailDialog({
  poolId, onClose, onRename, onDelete,
}: { poolId: string | null; onClose: () => void; onRename: (pool: TalentPool) => void; onDelete: (pool: TalentPool) => void }) {
  const t = useTranslations("talentPool");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const { data: pool, isLoading } = useTalentPool(poolId);
  const removeCandidate = useRemoveCandidateFromPool();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [candidateSearch, setCandidateSearch] = useState("");
  const [showAddCandidate, setShowAddCandidate] = useState(false);

  async function handleRemove(candidate: PooledCandidate) {
    if (!poolId) return;
    const ok = await confirm({ message: t("removeCandidateConfirm"), variant: "destructive", confirmLabel: t("removeCandidate") });
    if (!ok) return;
    try {
      await removeCandidate.mutateAsync({ poolId, candidateId: candidate._id });
      toast.success(t("candidateRemoved"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const q = candidateSearch.trim().toLowerCase();
  const visibleCandidates = (pool?.candidates ?? []).filter((candidate) => {
    if (!q) return true;
    const ref = refOf(candidate);
    const name = candidateLabel(ref).toLowerCase();
    const skillMatch = ref?.skills?.some((s) => s.toLowerCase().includes(q));
    return name.includes(q) || skillMatch;
  });

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open={Boolean(poolId)} onOpenChange={(o) => { if (!o) { onClose(); setShowAddCandidate(false); setCandidateSearch(""); } }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden rounded-3xl p-0">
          {isLoading || !pool ? (
            <div className="flex justify-center py-16">
              <DialogTitle className="sr-only">{t("title")}</DialogTitle>
              <DialogDescription className="sr-only">{t("subtitle")}</DialogDescription>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex max-h-[88vh] flex-col">
              <DialogHeader className="border-b border-border px-6 py-5">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" /> {pool.name}
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={() => onRename(pool)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t("edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {pool.description ? (
                  <DialogDescription>{pool.description}</DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">{pool.name}</DialogDescription>
                )}
                {pool.tags?.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {pool.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px]">
                        <Tag className="mr-1 h-2.5 w-2.5" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("candidateCount", { count: pool.candidates?.length ?? 0 })}
                  </p>
                  {!showAddCandidate && (
                    <Button size="sm" variant="outline" onClick={() => setShowAddCandidate(true)}>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      {t("addCandidate")}
                    </Button>
                  )}
                </div>

                {showAddCandidate && (
                  <AddCandidateSection pool={pool} onDone={() => setShowAddCandidate(false)} />
                )}

                {pool.candidates?.length ? (
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder={t("searchInPoolPlaceholder")}
                      className="pl-9"
                    />
                  </div>
                ) : null}

                {pool.candidates?.length ? (
                  visibleCandidates.length ? (
                    <ul className="space-y-2">
                      {visibleCandidates.map((candidate) => {
                        const ref = refOf(candidate);
                        const name = candidateLabel(ref);
                        return (
                          <li
                            key={candidate._id}
                            className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background p-4"
                          >
                            <div className="flex min-w-0 gap-3">
                              <CandidateAvatar ref={ref} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                                {ref?.headline ? (
                                  <p className="truncate text-xs text-muted-foreground">{ref.headline}</p>
                                ) : null}
                                {ref?.skills?.length ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {ref.skills.slice(0, 5).map((skill) => (
                                      <span
                                        key={skill}
                                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="mt-1.5 flex items-center gap-2">
                                  <Badge variant="outline" className={`text-[10px] ${SOURCE_BADGE_CLASS[candidate.source]}`}>
                                    {t(`sources.${candidate.source}`)}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground">
                                    <RelativeDate date={candidate.addedAt} prefix={t("addedPrefix")} />
                                  </span>
                                </div>
                                {candidate.notes ? (
                                  <p className="mt-1 text-xs italic text-muted-foreground">{candidate.notes}</p>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {ref?._id ? (
                                <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                                  <Link href={`/${locale}/employer/candidates/${ref._id}`} title={t("viewProfile")}>
                                    <ExternalLink className="h-4 w-4" />
                                    <span className="sr-only">{t("viewProfile")}</span>
                                  </Link>
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => handleRemove(candidate)}
                                disabled={removeCandidate.isPending}
                                title={t("removeCandidate")}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">{t("removeCandidate")}</span>
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("noSearchResults")}</p>
                  )
                ) : (
                  <div className="flex flex-col items-center py-10 text-center">
                    <Users className="h-9 w-9 text-muted-foreground/40" />
                    <p className="mt-3 text-sm font-medium text-foreground">{t("noCandidatesTitle")}</p>
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">{t("noCandidates")}</p>
                    {!showAddCandidate && (
                      <Button size="sm" className="mt-4" onClick={() => setShowAddCandidate(true)}>
                        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                        {t("addCandidate")}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => onDelete(pool)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("delete")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
