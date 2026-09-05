"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Copy, Trash2, Search, FileText, Inbox, Pencil, ArrowRight, Loader2, Briefcase,
} from "lucide-react";
import RelativeDate from "@/components/shared/RelativeDate";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useJobTemplateLibrary,
  useUpdateJobTemplate,
  useDeleteJobTemplate,
  useDuplicateJobTemplate,
  useUseJobTemplate,
  type JobTemplateDetail,
} from "@/hooks/useJobs";

export default function EmployerJobTemplatesPage() {
  const t = useTranslations("employerJobTemplates");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(10);
  const { data, isLoading: loading, isError, refetch } = useJobTemplateLibrary({ search, page, limit });
  const templates = data?.templates ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const updateTemplate = useUpdateJobTemplate();
  const deleteTemplate = useDeleteJobTemplate();
  const duplicateTemplate = useDuplicateJobTemplate();
  const useTemplate = useUseJobTemplate();

  const [editing, setEditing] = useState<JobTemplateDetail | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  function openEdit(tmpl: JobTemplateDetail) {
    setEditing(tmpl);
    setEditName(tmpl.name);
    setEditTitle(tmpl.title ?? "");
  }

  async function handleSaveEdit() {
    if (!editing || !editName.trim()) return;
    try {
      await updateTemplate.mutateAsync({ templateId: editing._id, name: editName.trim(), title: editTitle.trim() });
      toast.success(t("toastUpdated"));
      setEditing(null);
    } catch {
      toast.error(t("toastUpdateFailed"));
    }
  }

  async function handleDelete(tmpl: JobTemplateDetail) {
    const ok = await confirmDialog(t("deleteConfirm", { name: tmpl.name }));
    if (!ok) return;
    try {
      await deleteTemplate.mutateAsync(tmpl._id);
      toast.success(t("toastDeleted"));
    } catch {
      toast.error(t("toastDeleteFailed"));
    }
  }

  async function handleDuplicate(tmpl: JobTemplateDetail) {
    try {
      await duplicateTemplate.mutateAsync(tmpl);
      toast.success(t("toastDuplicated"));
    } catch {
      toast.error(t("toastDuplicateFailed"));
    }
  }

  async function handleUse(tmpl: JobTemplateDetail) {
    setBusyId(tmpl._id);
    try {
      const data = await useTemplate.mutateAsync(tmpl._id);
      router.push(`/${locale}/employer/jobs/${data.job._id}/edit`);
    } catch {
      toast.error(t("toastUseFailed"));
      setBusyId(null);
    }
  }

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* Pattern A (compact workspace): title + the library size; the
          search sits in the list toolbar like every other list page. */}
      <WorkspaceHeader
        title={t("title")}
        context={
          <>
            <span className="sm:hidden">{t("templateCount", { count: total })}</span>
            <span className="hidden sm:inline">{t("description")} · {t("templateCount", { count: total })}</span>
          </>
        }
      />

      <div className="workspace-toolbar">
        <div className="workspace-toolbar-search">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-11 rounded-xl border-border bg-background ps-9 text-sm shadow-none sm:h-10"
            aria-label={t("search")}
          />
        </div>
      </div>

      {/* Template Grid — the items are cards themselves, so on phones the outer
          panel surface read as a card inside a card with double edges. Panel
          chrome only from sm up. */}
      <section className="workspace-panel-surface rounded-3xl panel-body max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-sm font-semibold text-destructive">{t("loadError")}</p>
            <Button variant="outline" onClick={() => refetch()}>{t("retry")}</Button>
          </div>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel rounded-2xl space-y-3 panel-body">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-4" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noTemplates")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noTemplatesDesc")}</p>
            {/* Templates are only created from an existing job, so the empty
                state has to say where that happens instead of dead-ending. */}
            <p className="mt-3 text-xs text-muted-foreground">{t("emptyCtaHint")}</p>
            <Link href={`/${locale}/employer/jobs`} className="mt-3">
              <Button variant="outline" size="sm">
                <Briefcase className="h-4 w-4 me-2" />
                {t("emptyCta")}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tmpl) => (
              <div key={tmpl._id} className="workspace-glass-panel rounded-2xl space-y-3 panel-body">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">{tmpl.title}</p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground/50" />
                </div>

                {tmpl.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
                )}

                {tmpl.requirements?.skills && tmpl.requirements.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tmpl.requirements.skills.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{s}</span>
                    ))}
                    {tmpl.requirements.skills.length > 4 && (
                      <span className="text-[11px] text-muted-foreground">+{tmpl.requirements.skills.length - 4}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">
                    <RelativeDate date={tmpl.updatedAt} prefix={t("savedAgoPrefix")} />
                  </span>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(tmpl)} aria-label={t("edit")}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(tmpl)} aria-label={t("duplicate")} disabled={duplicateTemplate.isPending}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(tmpl)} aria-label={t("deleteAction")}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                    <Button size="sm" onClick={() => handleUse(tmpl)} disabled={busyId === tmpl._id}>
                      {busyId === tmpl._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>{t("use")} <ArrowRight className="h-3.5 w-3.5 ml-1" /></>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && total > 0 && (
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
            className="mt-5 pt-4 border-t border-border/50"
          />
        )}
      </section>

      {/* Rename/Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t("fieldTemplateName")}</label>
              <Input value={editName} maxLength={100} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t("fieldJobTitle")}</label>
              <Input value={editTitle} maxLength={200} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            <Button onClick={handleSaveEdit} disabled={updateTemplate.isPending || !editName.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
