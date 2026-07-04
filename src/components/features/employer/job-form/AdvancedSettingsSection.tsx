"use client";

import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Settings, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { JobTemplatePickers } from "./JobTemplatePickers";
import type { WorkflowTemplateItem } from "@/hooks/useWorkflowTemplates";
import type { MatchingWeightTemplateItem } from "@/hooks/useMatchingWeightTemplates";
import type { JobFormValues } from "./jobFormSchema";

interface AssignedAgent {
  _id: string;
  name: string;
}

export function AdvancedSettingsSection() {
  const t = useTranslations("employerJobForm.advanced");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { register, watch, setValue } = useFormContext<JobFormValues>();

  const autoScreening = watch("autoScreeningEnabled");
  const minMatchScore = watch("minMatchScore");
  const visibility = watch("visibility");
  const tags = watch("tags") ?? [];
  const applicationMode = watch("applicationMode");
  const expiresAt = watch("expiresAt");
  const maxApplicants = watch("maxApplicants");
  const agentId = watch("agentId");

  const [agents, setAgents] = useState<AssignedAgent[]>([]);
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState<string | null>(null);
  const [selectedMatchingWeightTemplateId, setSelectedMatchingWeightTemplateId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employers/agents")
      .then((r) => r.ok ? r.json() : { agents: [] })
      .then((data: { agents?: AssignedAgent[] }) => setAgents(data.agents ?? []))
      .catch(() => {});
  }, []);

  const [tagInput, setTagInput] = useState("");

  function formatDate(date: string) {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(parsed);
  }

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 20) return;
    setValue("tags", [...tags, trimmed], { shouldValidate: false });
    setTagInput("");
  }

  function removeTag(tag: string) {
    setValue("tags", tags.filter((t) => t !== tag), { shouldValidate: false });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40"
      >
        <div className="space-y-2 text-start">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            {t("title")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-[11px]">
              {applicationMode === "auto" ? t("autoMatch") : t("manualReview")}
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {t(`visibilityBadges.${visibility}`)}
            </Badge>
            {autoScreening && (
              <Badge variant="secondary" className="text-[11px]">
                {t("screeningAt", { score: minMatchScore })}
              </Badge>
            )}
            {expiresAt && (
              <Badge variant="secondary" className="text-[11px]">
                {t("expires", { date: formatDate(expiresAt) })}
              </Badge>
            )}
            {typeof maxApplicants === "number" && !Number.isNaN(maxApplicants) && (
              <Badge variant="secondary" className="text-[11px]">
                {t("maxApplicantsBadge", { count: maxApplicants })}
              </Badge>
            )}
            {tags.length > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                {t("tagsBadge", { count: tags.length })}
              </Badge>
            )}
            {agentId && agents.length > 0 && (
              <Badge variant="secondary" className="text-[11px]">
                {t("agentBadge", { name: agents.find((a) => a._id === agentId)?.name ?? t("assigned") })}
              </Badge>
            )}
            {selectedWorkflowTemplateId && (
              <Badge variant="secondary" className="text-[11px]">
                {t("workflowTemplateBadge")}
              </Badge>
            )}
            {selectedMatchingWeightTemplateId && (
              <Badge variant="secondary" className="text-[11px]">
                {t("weightTemplateBadge")}
              </Badge>
            )}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="advanced"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-5 border-t border-border px-5 pb-5 pt-4">

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Label className="text-sm font-medium">{t("applicationMode")}</Label>
                  <SearchableSelect
                    options={[
                      { value: "manual", label: t("applicationModes.manual") },
                      { value: "auto", label: t("applicationModes.auto") },
                    ]}
                    value={applicationMode}
                    onValueChange={(v) =>
                      setValue("applicationMode", v as "auto" | "manual", { shouldValidate: false })
                    }
                  />
                </div>

                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Label className="text-sm font-medium">{t("visibility")}</Label>
                  <SearchableSelect
                    options={[
                      { value: "public", label: t("visibilityOptions.public") },
                      { value: "private", label: t("visibilityOptions.private") },
                      { value: "invite_only", label: t("visibilityOptions.invite_only") },
                    ]}
                    value={visibility}
                    onValueChange={(v) =>
                      setValue("visibility", v as "public" | "private" | "invite_only", {
                        shouldValidate: false,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t("autoScreening")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("autoScreeningHint")}
                    </p>
                  </div>
                  <Switch
                    checked={autoScreening}
                    onCheckedChange={(v) =>
                      setValue("autoScreeningEnabled", v, { shouldValidate: false })
                    }
                  />
                </div>

                <AnimatePresence>
                  {autoScreening && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 border-s-2 border-primary/30 ps-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="min-match-score" className="text-xs text-muted-foreground">
                            {t("minMatchScore")}
                          </Label>
                          <span className="text-sm font-semibold text-primary">
                            {minMatchScore}%
                          </span>
                        </div>
                        <input
                          id="min-match-score"
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={minMatchScore}
                          aria-label={t("minMatchScoreAria")}
                          onChange={(e) =>
                            setValue("minMatchScore", Number(e.target.value), {
                              shouldValidate: false,
                            })
                          }
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t("thresholdAll")}</span>
                          <span>{t("thresholdModerate")}</span>
                          <span>{t("thresholdExact")}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Label htmlFor="expires-at" className="text-sm font-medium">
                    {t("expiryDate")}
                  </Label>
                  <DateTimePicker
                    mode="date"
                    value={expiresAt ?? ""}
                    onChange={(v) => setValue("expiresAt", v, { shouldValidate: false })}
                    minDate={new Date()}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("expiryHint")}
                  </p>
                </div>

                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Label htmlFor="max-applicants" className="text-sm font-medium">
                    {t("maxApplicants")}
                  </Label>
                  <Input
                    id="max-applicants"
                    type="number"
                    min={1}
                    max={10000}
                    {...register("maxApplicants", { valueAsNumber: true, setValueAs: (v) => v === "" || isNaN(v) ? undefined : Number(v) })}
                    placeholder={t("noLimit")}
                    className="w-36"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("maxApplicantsHint")}
                  </p>
                </div>
              </div>

              {agents.length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Label className="text-sm font-medium">{t("assignAgent")}</Label>
                  <SearchableSelect
                    options={[
                      { value: "", label: t("noAgent") },
                      ...agents.map((a) => ({ value: a._id, label: a.name })),
                    ]}
                    value={agentId ?? ""}
                    onValueChange={(v) =>
                      setValue("agentId", v === "" ? undefined : v, { shouldValidate: false })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("assignAgentHint")}
                  </p>
                </div>
              )}

              {/* ─── Workflow & Matching Weight Templates ─── */}
              <div className="space-y-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                <Label className="text-sm font-medium">{t("configurationTemplates")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("configurationTemplatesHint")}
                </p>
                <div className="mt-2">
                  <JobTemplatePickers
                    selectedWorkflowTemplateId={selectedWorkflowTemplateId}
                    selectedMatchingWeightTemplateId={selectedMatchingWeightTemplateId}
                    onWorkflowTemplateSelect={(t: WorkflowTemplateItem | null) => setSelectedWorkflowTemplateId(t?._id ?? null)}
                    onMatchingWeightTemplateSelect={(t: MatchingWeightTemplateItem | null) => setSelectedMatchingWeightTemplateId(t?._id ?? null)}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-border/70 bg-background p-4">
                <Label className="text-sm font-medium">{t("tags")}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("tagPlaceholder")}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                      } else if (e.key === ",") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    className="flex-1"
                  />
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)}>
                          <X className="w-3 h-3 hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("tagsHint")}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
