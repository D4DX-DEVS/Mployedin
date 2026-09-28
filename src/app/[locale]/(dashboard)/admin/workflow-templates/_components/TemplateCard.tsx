"use client";

import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Copy, Edit2, GitBranch, Shield, ShieldOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { WorkflowStageChips } from "@/components/features/workflow/WorkflowStageChips";
import { hasMatchRules } from "@/lib/hiring/workflowTemplateMatch";
import type { WorkflowTemplateAction, WorkflowTemplateItem } from "@/hooks/useWorkflowTemplates";
import { cn } from "@/lib/utils";

const EMPLOYMENT_TYPE_KEYS: Record<string, string> = {
  full_time: "employmentFullTime",
  part_time: "employmentPartTime",
  contract: "employmentContract",
  internship: "employmentInternship",
  freelance: "employmentFreelance",
  walk_in: "employmentWalkIn",
};
const WORK_MODE_KEYS: Record<string, string> = { onsite: "workModeOnsite", hybrid: "workModeHybrid", remote: "workModeRemote" };

interface TemplateCardProps {
  template: WorkflowTemplateItem;
  pendingAction: WorkflowTemplateAction | "delete" | null;
  onEdit: () => void;
  onAction: (action: WorkflowTemplateAction) => void;
  onDelete: () => void;
  onShowJobs: () => void;
}

export function TemplateCard({ template, pendingAction, onEdit, onAction, onDelete, onShowJobs }: TemplateCardProps) {
  const t = useTranslations("workflowTemplates");
  const tr = useTranslations("adminWorkflowTemplates");
  const used = template.usageCount ?? 0;
  const archived = !template.isActive;

  const rules: string[] = [];
  const m = template.match;
  if (m.categories?.length) rules.push(t("ruleCategories", { values: m.categories.join(", ") }));
  if (m.employmentTypes?.length) rules.push(t("ruleEmploymentTypes", { values: m.employmentTypes.map((v) => (EMPLOYMENT_TYPE_KEYS[v] ? t(EMPLOYMENT_TYPE_KEYS[v]) : v)).join(", ") }));
  if (m.workModes?.length) rules.push(t("ruleWorkModes", { values: m.workModes.map((v) => (WORK_MODE_KEYS[v] ? t(WORK_MODE_KEYS[v]) : v)).join(", ") }));
  if (m.titleKeywords?.length) rules.push(t("ruleTitleKeywords", { values: m.titleKeywords.map((k) => `“${k}”`).join(", ") }));
  if (m.minExperienceYears) rules.push(t("ruleMinExperience", { years: m.minExperienceYears }));

  const menu: RowAction[] = [
    { key: "duplicate", label: t("actionDuplicate"), icon: Copy, onSelect: () => onAction("duplicate"), pending: pendingAction === "duplicate" },
    ...(!archived
      ? [template.isDefault
          ? { key: "unset_default", label: t("actionUnsetDefault"), icon: ShieldOff, onSelect: () => onAction("unset_default"), pending: pendingAction === "unset_default" }
          : { key: "set_default", label: t("actionSetDefault"), icon: Shield, onSelect: () => onAction("set_default"), pending: pendingAction === "set_default" }]
      : []),
    archived
      ? { key: "restore", label: t("actionRestore"), icon: ArchiveRestore, onSelect: () => onAction("restore"), pending: pendingAction === "restore" }
      : { key: "archive", label: t("actionArchive"), icon: Archive, onSelect: () => onAction("archive"), pending: pendingAction === "archive" },
    // A template jobs run on is archived, never deleted.
    ...(used === 0
      ? [{ key: "delete", label: tr("deleteButtonLabel"), icon: Trash2, onSelect: onDelete, destructive: true, pending: pendingAction === "delete" }]
      : []),
  ];

  return (
    <article
      className={cn(
        "rounded-2xl border bg-background/80 panel-body transition-colors",
        archived ? "border-dashed border-border opacity-80" : "border-border hover:border-sky-500/25",
      )}
      aria-labelledby={`wf-template-${template._id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            <h2 id={`wf-template-${template._id}`} className="text-sm font-semibold text-foreground">{template.name}</h2>
            {template.isDefault && (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Shield className="h-3 w-3" aria-hidden="true" /> {tr("defaultBadge")}
              </Badge>
            )}
            {archived && <Badge variant="outline" className="text-[11px]">{t("archivedBadge")}</Badge>}
            <Badge variant="outline" className="text-[11px]">{t("versionBadge", { version: template.version })}</Badge>
          </div>
          {template.description && <p className="text-xs text-muted-foreground">{template.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
          <RowActions
            name={template.name}
            quick={[{ key: "edit", label: t("actionEdit"), icon: Edit2, onSelect: onEdit, iconOnly: true }]}
            menu={menu}
          />
        </div>
      </div>

      <WorkflowStageChips stages={template.stages} label={t("stagesOf", { name: template.name })} className="mt-3" />

      <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0">
          <span className="font-medium text-foreground">{t("pickedFor")}</span>{" "}
          {hasMatchRules(m) ? rules.join(" · ") : template.isDefault ? t("pickedForDefault") : t("pickedForManual")}
          {hasMatchRules(m) && template.priority > 0 && <> · {t("priorityValue", { priority: template.priority })}</>}
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 self-start px-2 text-xs sm:self-auto" onClick={onShowJobs} disabled={used === 0}>
          {t("usedByJobs", { count: used })}
        </Button>
      </div>
    </article>
  );
}
