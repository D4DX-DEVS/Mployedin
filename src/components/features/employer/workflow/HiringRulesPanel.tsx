"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, ListChecks, ShieldAlert, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  HIRING_RULE_DEFAULTS,
  SHORTLIST_TARGET_MAX,
  SHORTLIST_TARGET_MIN,
  type HiringRules,
} from "@/lib/hiring/workflowSettings";

interface HiringRulesPanelProps {
  rules: HiringRules;
  onChange: (next: HiringRules) => void;
  disabled?: boolean;
  /** Distinguishes the company-wide editor from the per-job one when both are mounted. */
  idPrefix?: string;
}

function clampTarget(raw: string): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return HIRING_RULE_DEFAULTS.shortlistTarget;
  return Math.min(SHORTLIST_TARGET_MAX, Math.max(SHORTLIST_TARGET_MIN, n));
}

/**
 * The three hiring rules, and nothing else. Stage editing is gone on purpose:
 * the board, the tabs and the dropdowns all read the fixed pipeline, so a
 * reorder/pause control here changed nothing the employer could see.
 */
export function HiringRulesPanel({ rules, onChange, disabled = false, idPrefix = "hiring-rules" }: HiringRulesPanelProps) {
  const t = useTranslations("hiringRules");
  const [targetDraft, setTargetDraft] = useState(String(rules.shortlistTarget));
  useEffect(() => setTargetDraft(String(rules.shortlistTarget)), [rules.shortlistTarget]);

  const commitTarget = () => {
    const next = clampTarget(targetDraft);
    setTargetDraft(String(next));
    if (next !== rules.shortlistTarget) onChange({ ...rules, shortlistTarget: next });
  };

  const targetId = `${idPrefix}-shortlist-target`;
  const autoRejectId = `${idPrefix}-auto-reject`;
  const thresholdId = `${idPrefix}-threshold`;
  const notifyId = `${idPrefix}-notify`;

  return (
    <section className="workspace-panel-surface space-y-5 rounded-3xl panel-body">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("rulesEyebrow")}</p>
        <h2 className="heading-subsection mt-2 font-semibold text-foreground">{t("rulesTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rulesDesc")}</p>
      </div>

      {/* Rule 1 — shortlist target */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10">
          <ListChecks className="h-4 w-4 text-status-selected" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Label htmlFor={targetId} className="text-sm font-medium text-foreground">{t("shortlistTarget")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={targetId}
                type="number"
                inputMode="numeric"
                min={SHORTLIST_TARGET_MIN}
                max={SHORTLIST_TARGET_MAX}
                step={5}
                value={targetDraft}
                disabled={disabled}
                onChange={(e) => setTargetDraft(e.target.value)}
                onBlur={commitTarget}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTarget(); } }}
                className="h-10 w-20 text-center font-semibold"
              />
              <span className="text-xs text-muted-foreground">{t("shortlistTargetUnit")}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("shortlistTargetDesc")}</p>
        </div>
      </div>

      <div className="border-t border-border/60" />

      {/* Rule 2 — auto-reject on arrival (opt-in) */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
            <ShieldAlert className="h-4 w-4 text-status-rejected" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p id={autoRejectId} className="text-sm font-medium text-foreground">{t("autoReject")}</p>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  className="tap-target-box"
                  aria-labelledby={autoRejectId}
                  checked={rules.autoRejectEnabled}
                  disabled={disabled}
                  onCheckedChange={(v) => onChange({ ...rules, autoRejectEnabled: v })}
                />
                <Badge
                  variant={rules.autoRejectEnabled ? "destructive" : "secondary"}
                  className="min-w-[3.5rem] justify-center whitespace-nowrap rounded-full px-2 text-[11px]"
                >
                  {rules.autoRejectEnabled ? t("on") : t("off")}
                </Badge>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("autoRejectDesc")}</p>
          </div>
        </div>

        {rules.autoRejectEnabled && (
          <div className="space-y-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-3 sm:ms-[3.25rem]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={thresholdId} className="text-sm font-medium text-foreground">{t("autoRejectThreshold")}</label>
              <span className="text-sm font-bold text-status-rejected">{t("autoRejectThresholdValue", { value: rules.autoRejectBelow })}</span>
            </div>
            <input
              id={thresholdId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={rules.autoRejectBelow}
              disabled={disabled}
              onChange={(e) => onChange({ ...rules, autoRejectBelow: Number(e.target.value) })}
              className="w-full cursor-pointer accent-red-600"
            />
            <p className="flex items-start gap-1.5 text-xs text-status-rejected">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("autoRejectWarning")}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border/60" />

      {/* Rule 3 — candidate notifications */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10">
          <Bell className="h-4 w-4 text-status-applied" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p id={notifyId} className="text-sm font-medium text-foreground">{t("notifyCandidates")}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                className="tap-target-box"
                aria-labelledby={notifyId}
                checked={rules.notifyOnStageChange}
                disabled={disabled}
                onCheckedChange={(v) => onChange({ ...rules, notifyOnStageChange: v })}
              />
              <Badge
                variant={rules.notifyOnStageChange ? "default" : "secondary"}
                className="min-w-[3.5rem] justify-center whitespace-nowrap rounded-full px-2 text-[11px]"
              >
                {rules.notifyOnStageChange ? t("on") : t("off")}
              </Badge>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("notifyCandidatesDesc")}</p>
        </div>
      </div>
    </section>
  );
}
