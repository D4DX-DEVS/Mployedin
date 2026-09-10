"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, CheckCircle, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HiringRulesPanel } from "@/components/features/employer/workflow/HiringRulesPanel";
import { PipelinePreview } from "@/components/features/employer/workflow/PipelinePreview";
import { useJobWorkflow, useSaveJobWorkflow } from "@/hooks/useJobWorkflow";
import { HIRING_RULE_DEFAULTS, resolveHiringRules, type HiringRules, type HiringRulesInput } from "@/lib/hiring/workflowSettings";

interface Props { jobId: string; }

/**
 * Per-job hiring rules. Until the employer saves here the job follows the
 * company-wide rules; a save stamps the job and its rules take precedence.
 */
export function JobWorkflowTab({ jobId }: Props) {
  const t = useTranslations("hiringRules");
  const ta = useTranslations("a11y");
  const { data, isLoading, error: fetchError } = useJobWorkflow(jobId);
  const saveWorkflow = useSaveJobWorkflow(jobId);

  const [rules, setRules] = useState<HiringRules>({ ...HIRING_RULE_DEFAULTS });
  const [source, setSource] = useState<"job" | "employer">("employer");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.settings) setRules(resolveHiringRules(undefined, data.settings as HiringRulesInput));
    setSource(data.source);
  }, [data]);

  useEffect(() => { if (fetchError) setError(t("loadError")); }, [fetchError, t]);

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
      setSource("job");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t("saveError"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <div
        className={
          source === "job"
            ? "flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
            : "flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700"
        }
      >
        {source === "job"
          ? <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          : <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {source === "job" ? t("jobHasOwnRules") : t("jobFollowsEmployer")}
      </div>

      {dirty && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
          {t("unsavedChanges")}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-medium text-red-400 hover:text-red-600" aria-label={ta("close")}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.65fr]">
        <PipelinePreview />
        <div className="space-y-4">
          <HiringRulesPanel rules={rules} onChange={handleChange} disabled={saveWorkflow.isPending} idPrefix="job-hiring-rules" />
          <Button
            onClick={handleSave}
            disabled={saveWorkflow.isPending || !dirty}
            className="w-full gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {saveWorkflow.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : saved ? <CheckCircle className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saveWorkflow.isPending ? t("saving") : saved ? t("saved") : t("saveForJob")}
          </Button>
        </div>
      </div>
    </div>
  );
}
