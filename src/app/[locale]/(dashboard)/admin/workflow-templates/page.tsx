"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHero } from "@/components/shared/PageHero";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import {
  TemplateInUseError,
  useAdminWorkflowTemplateAction,
  useAdminWorkflowTemplates,
  useDeleteAdminWorkflowTemplate,
  type WorkflowTemplateAction,
  type WorkflowTemplateItem,
} from "@/hooks/useWorkflowTemplates";
import { TemplateCard } from "./_components/TemplateCard";
import { TemplateEditorDialog } from "./_components/TemplateEditorDialog";
import { TemplateJobsDialog } from "./_components/TemplateJobsDialog";

const ACTION_TOAST_KEYS: Record<WorkflowTemplateAction, string> = {
  set_default: "toastSetDefault",
  unset_default: "toastUnsetDefault",
  archive: "toastArchive",
  restore: "toastRestore",
  duplicate: "toastDuplicate",
};

/**
 * Platform workflow templates. A job is given one automatically from its
 * details (the match rules here), falling back to the employer's default and
 * then the platform default; the job keeps a snapshot, so editing a template
 * only affects jobs posted afterwards.
 */
export default function AdminWorkflowTemplatesPage() {
  const tr = useTranslations("adminWorkflowTemplates");
  const t = useTranslations("workflowTemplates");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { data, isLoading, isError, refetch } = useAdminWorkflowTemplates();
  const actionMut = useAdminWorkflowTemplateAction();
  const deleteMut = useDeleteAdminWorkflowTemplate();

  const [editor, setEditor] = useState<{ open: boolean; template: WorkflowTemplateItem | null }>({ open: false, template: null });
  const [jobsFor, setJobsFor] = useState<WorkflowTemplateItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: WorkflowTemplateAction | "delete" } | null>(null);

  const templates = data?.templates ?? [];
  const active = templates.filter((tpl) => tpl.isActive);
  const archived = templates.filter((tpl) => !tpl.isActive);
  const shown = showArchived ? [...active, ...archived] : active;

  const runAction = async (template: WorkflowTemplateItem, action: WorkflowTemplateAction) => {
    if (action === "archive") {
      const ok = await confirm({
        title: t("archiveConfirmTitle"),
        message: t("archiveConfirmMessage", { name: template.name, count: template.usageCount ?? 0 }),
        confirmLabel: t("actionArchive"),
      });
      if (!ok) return;
    }
    setPending({ id: template._id, action });
    try {
      await actionMut.mutateAsync({ id: template._id, action });
      toast.success(t(ACTION_TOAST_KEYS[action], { name: template.name }));
    } catch {
      toast.error(t("actionError"));
    } finally {
      setPending(null);
    }
  };

  const handleDelete = async (template: WorkflowTemplateItem) => {
    const ok = await confirm({
      title: tr("deleteConfirmTitle"),
      message: tr("deleteConfirmMessage", { name: template.name }),
      confirmLabel: tr("deleteConfirmAction"),
      variant: "destructive",
    });
    if (!ok) return;
    setPending({ id: template._id, action: "delete" });
    try {
      await deleteMut.mutateAsync(template._id);
      toast.success(t("templateDeleted", { name: template.name }));
    } catch (err) {
      toast.error(err instanceof TemplateInUseError ? t("deleteInUse", { count: err.count }) : t("actionError"));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero
        compact
        compactOnMobile
        icon={GitBranch}
        title={tr("pageTitle")}
        description={t("adminPageDescription")}
        actions={
          <Button onClick={() => setEditor({ open: true, template: null })} className="gap-2 rounded-xl" size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" /> {tr("newTemplateButton")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3" aria-hidden="true">
          {[1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl border border-border bg-background/70" />)}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-border bg-background/80 panel-body text-center">
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>{t("retry")}</Button>
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={tr("noTemplatesEmptyStateTitle")}
          description={t("emptyDescription")}
          action={
            <Button onClick={() => setEditor({ open: true, template: null })} size="sm" className="gap-1.5 rounded-xl">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {tr("createFirstTemplateButton")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("resolutionOrder")}</p>
          {shown.map((template) => (
            <TemplateCard
              key={template._id}
              template={template}
              pendingAction={pending?.id === template._id ? pending.action : null}
              onEdit={() => setEditor({ open: true, template })}
              onAction={(action) => void runAction(template, action)}
              onDelete={() => void handleDelete(template)}
              onShowJobs={() => setJobsFor(template)}
            />
          ))}
          {archived.length > 0 && (
            <Button variant="ghost" size="sm" className="h-10 text-xs" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? t("hideArchived") : t("showArchived", { count: archived.length })}
            </Button>
          )}
        </div>
      )}

      <TemplateEditorDialog
        open={editor.open}
        template={editor.template}
        categoryOptions={data?.categoryOptions ?? []}
        onClose={() => setEditor({ open: false, template: null })}
      />
      <TemplateJobsDialog template={jobsFor} onClose={() => setJobsFor(null)} />
    </div>
  );
}
