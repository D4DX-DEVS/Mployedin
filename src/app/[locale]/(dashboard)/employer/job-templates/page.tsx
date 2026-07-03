"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Copy, Trash2, Search, FileText, Inbox, Pencil, ArrowRight, Loader2,
} from "lucide-react";
import RelativeDate from "@/components/shared/RelativeDate";
import { PaginationControls } from "@/components/shared/PaginationControls";
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
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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

      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="mt-5 workspace-glass-panel rounded-2xl p-4 sm:w-64">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("totalTemplates")}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{total}</p>
        </div>
      </section>

      {/* Search */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("search")} value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
        </div>
      </section>

      {/* Template Grid */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="text-sm font-semibold text-destructive">{t("loadError")}</p>
            <Button variant="outline" onClick={() => refetch()}>{t("retry")}</Button>
          </div>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel rounded-2xl p-5 space-y-3">
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
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tmpl) => (
              <div key={tmpl._id} className="workspace-glass-panel rounded-2xl p-5 space-y-3">
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
                      <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
                    ))}
                    {tmpl.requirements.skills.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{tmpl.requirements.skills.length - 4}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
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
