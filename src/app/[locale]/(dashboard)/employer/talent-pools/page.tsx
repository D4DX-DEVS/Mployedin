"use client";

import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/hooks/useConfirm";
import { PageHero } from "@/components/shared/PageHero";
import {
  Layers,
  Loader2,
  Plus,
  Trash2,
  Users,
  ExternalLink,
  Tag,
} from "lucide-react";
import {
  useTalentPools,
  useTalentPool,
  useCreatePool,
  useDeletePool,
  useRemoveCandidateFromPool,
  type TalentPool,
  type PooledCandidate,
  type PooledCandidateRef,
} from "@/hooks/useTalentPools";

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

export default function EmployerTalentPoolsPage() {
  const t = useTranslations("talentPool");
  const { data: pools = [], isLoading, isError } = useTalentPools();
  const [createOpen, setCreateOpen] = useState(false);
  const [activePoolId, setActivePoolId] = useState<string | null>(null);

  return (
    <div className="page-container space-y-6">
      <PageHero
        icon={Layers}
        title={t("title")}
        description={t("subtitle")}
        actions={
          pools.length > 0 ? (
            <Button onClick={() => setCreateOpen(true)} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              {t("createPool")}
            </Button>
          ) : undefined
        }
      />

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
          <p className="mt-4 text-sm text-muted-foreground">{t("noPools")}</p>
          <Button onClick={() => setCreateOpen(true)} className="mt-5">
            <Plus className="mr-2 h-4 w-4" />
            {t("createPool")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pools.map((pool) => (
            <PoolCard key={pool._id} pool={pool} onOpen={() => setActivePoolId(pool._id)} />
          ))}
        </div>
      )}

      <CreatePoolDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PoolDetailDialog poolId={activePoolId} onClose={() => setActivePoolId(null)} />
    </div>
  );
}

function PoolCard({ pool, onOpen }: { pool: TalentPool; onOpen: () => void }) {
  const t = useTranslations("talentPool");
  const count = pool.candidates?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground line-clamp-1">{pool.name}</h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <Users className="h-3 w-3" />
          {count}
        </span>
      </div>
      {pool.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{pool.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("candidateCount", { count })}</p>
      )}
      {pool.tags?.length ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {pool.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[11px]">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </button>
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

function PoolDetailDialog({ poolId, onClose }: { poolId: string | null; onClose: () => void }) {
  const t = useTranslations("talentPool");
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";
  const { data: pool, isLoading } = useTalentPool(poolId);
  const removeCandidate = useRemoveCandidateFromPool();
  const deletePool = useDeletePool();
  const { confirm, ConfirmDialogNode } = useConfirm();

  async function handleRemove(candidate: PooledCandidate) {
    const ref = refOf(candidate);
    const jobSeekerId = ref?._id ?? (typeof candidate.jobSeekerId === "string" ? candidate.jobSeekerId : "");
    if (!jobSeekerId || !poolId) return;
    const ok = await confirm({ message: t("removeCandidateConfirm"), variant: "destructive", confirmLabel: t("removeCandidate") });
    if (!ok) return;
    try {
      await removeCandidate.mutateAsync({ poolId, jobSeekerId });
      toast.success(t("candidateRemoved"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleDeletePool() {
    if (!poolId) return;
    const ok = await confirm({ message: t("deletePoolConfirm"), variant: "destructive", confirmLabel: t("delete") });
    if (!ok) return;
    try {
      await deletePool.mutateAsync(poolId);
      toast.success(t("archived"));
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      {ConfirmDialogNode}
      <Dialog open={Boolean(poolId)} onOpenChange={(o) => !o && onClose()}>
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
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" /> {pool.name}
                </DialogTitle>
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
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("candidateCount", { count: pool.candidates?.length ?? 0 })}
                </p>
                {pool.candidates?.length ? (
                  <ul className="space-y-2">
                    {pool.candidates.map((candidate) => {
                      const ref = refOf(candidate);
                      const name = ref?.fullName || ref?.userId?.name || ref?.userId?.email || "—";
                      return (
                        <li
                          key={candidate._id}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background p-4"
                        >
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
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              {t("source")}: {t(`sources.${candidate.source}`)}
                            </p>
                            {candidate.notes ? (
                              <p className="mt-1 text-xs italic text-muted-foreground">{candidate.notes}</p>
                            ) : null}
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
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("noCandidates")}</p>
                )}
              </div>

              <DialogFooter className="border-t border-border px-6 py-4">
                <Button
                  variant="outline"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleDeletePool}
                  disabled={deletePool.isPending}
                >
                  {deletePool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
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
