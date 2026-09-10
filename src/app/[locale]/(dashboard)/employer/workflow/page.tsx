"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Loader2, Save } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { FeatureGate } from "@/components/shared/FeatureGate";
import { Button } from "@/components/ui/button";
import { HiringRulesPanel } from "@/components/features/employer/workflow/HiringRulesPanel";
import { PipelinePreview } from "@/components/features/employer/workflow/PipelinePreview";
import { useWorkflow, useSaveWorkflow } from "@/hooks/useWorkflow";
import { HIRING_RULE_DEFAULTS, resolveHiringRules, type HiringRules, type HiringRulesInput } from "@/lib/hiring/workflowSettings";

/**
 * Company-wide hiring rules. The pipeline itself is fixed (every board, tab
 * and dropdown reads the same stage list), so the page shows it read-only and
 * edits only the three rules that actually change behaviour.
 */
export default function EmployerWorkflowPage() {
  const t = useTranslations("hiringRules");
  const tc = useTranslations("employerCommon");
  const ta = useTranslations("a11y");
  const { data, isLoading, error: fetchError } = useWorkflow();
  const saveWorkflow = useSaveWorkflow();

  const [rules, setRules] = useState<HiringRules>({ ...HIRING_RULE_DEFAULTS });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.settings) setRules(resolveHiringRules(undefined, data.settings as HiringRulesInput));
  }, [data]);

  useEffect(() => {
    if (fetchError) setError(t("loadError"));
  }, [fetchError, t]);

  const handleChange = (next: HiringRules) => {
    setRules(next);
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await saveWorkflow.mutateAsync({ settings: rules });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t("saveError"));
    }
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="h-20 animate-pulse rounded-3xl border border-border bg-background/70" />
        <div className="grid gap-5 xl:grid-cols-[1.35fr,0.65fr]">
          <div className="h-40 animate-pulse rounded-3xl border border-border bg-background/70" />
          <div className="h-72 animate-pulse rounded-3xl border border-border bg-background/70" />
        </div>
      </div>
    );
  }

  const saveButton = (
    <Button
      onClick={handleSave}
      disabled={saveWorkflow.isPending || !dirty}
      size="sm"
      className="gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
    >
      {saveWorkflow.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : saved ? (
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Save className="h-4 w-4" aria-hidden="true" />
      )}
      {saveWorkflow.isPending ? tc("loading") : saved ? t("saved") : (
        <>
          <span className="sm:hidden">{t("saveShort")}</span>
          <span className="hidden sm:inline">{t("save")}</span>
        </>
      )}
    </Button>
  );

  return (
    <FeatureGate feature="workflowCustomization">
      <div className="page-container">
        <WorkspaceHeader title={t("pageTitle")} context={t("pageDescription")} actions={saveButton} />

        {dirty && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-status-shortlisted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
            {t("unsavedChanges")}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-status-rejected">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600" aria-label={ta("close")}>✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
          <PipelinePreview />
          <div className="space-y-4">
            <HiringRulesPanel rules={rules} onChange={handleChange} disabled={saveWorkflow.isPending} />
            <Button
              onClick={handleSave}
              disabled={saveWorkflow.isPending || !dirty}
              className="w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground lg:hidden"
            >
              {saveWorkflow.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : saved ? <CheckCircle className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saveWorkflow.isPending ? t("saving") : saved ? t("saved") : t("save")}
            </Button>
          </div>
        </div>
      </div>
    </FeatureGate>
  );
}
