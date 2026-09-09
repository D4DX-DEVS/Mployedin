"use client";

import { useTranslations } from "next-intl";
import { Sliders } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * One implementation of the matching-weight builder for both places it is
 * shown: the employer-wide page (`/employer/matching-weights`) and the job's
 * Setup tab. Before this the job tab kept its own copy — number box on the
 * right, slider underneath, three summary tiles above — so the two screens an
 * employer flips between for the same setting read as different products.
 * Copy comes from `employerMatchingWeights` in both cases.
 */
export type WeightKey = "skills" | "experience" | "education" | "industryExperience" | "preferredQualifications";
export type WeightMap = Record<WeightKey, number>;

export const WEIGHT_KEYS: readonly WeightKey[] = ["skills", "experience", "education", "industryExperience", "preferredQualifications"];

export const DEFAULT_MATCHING_WEIGHTS: WeightMap = {
  skills: 40,
  experience: 30,
  education: 15,
  industryExperience: 10,
  preferredQualifications: 5,
};

export const WEIGHT_LABEL_KEYS: Record<WeightKey, string> = {
  skills: "skillsMatch",
  experience: "relevantExperience",
  education: "educationCerts",
  industryExperience: "industryExperience",
  preferredQualifications: "preferredQualifications",
};

export const WEIGHT_DESC_KEYS: Record<WeightKey, string> = {
  skills: "skillsMatchDesc",
  experience: "relevantExperienceDesc",
  education: "educationCertsDesc",
  industryExperience: "industryExperienceDesc",
  preferredQualifications: "preferredQualificationsDesc",
};

export function sumWeights(weights: WeightMap): number {
  return WEIGHT_KEYS.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
}

export function topWeightKey(weights: WeightMap): WeightKey {
  return WEIGHT_KEYS.reduce((highest, key) => (weights[key] > weights[highest] ? key : highest), WEIGHT_KEYS[0]);
}

interface WeightBuilderHeaderProps {
  weights: WeightMap;
  total: number;
  /** Heading level: the settings page owns an h1 above, the job tab sits under the workspace h1 + tab strip. */
  headingLevel?: 2 | 3;
}

/** Eyebrow · heading · helper · "Top priority" line, with the total chip pinned to the end. */
export function WeightBuilderHeader({ weights, total, headingLevel = 2 }: WeightBuilderHeaderProps) {
  const t = useTranslations("employerMatchingWeights");
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const isTotalValid = total === 100;
  const top = topWeightKey(weights);
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("weightBuilder")}</p>
        <Heading className="heading-subsection mt-2 flex items-center gap-2 font-semibold text-foreground">
          <Sliders className="h-4 w-4 text-status-applied" /> {t("weightConfig")}
        </Heading>
        <p className="mt-1 text-sm text-muted-foreground">{t("adjustPercentages")}</p>
        {/* Top priority as one line. It used to be a second full header
            whose three tiles restated the total and this same value. */}
        <p className="mt-1 text-xs text-muted-foreground">
          {t("topPriority")} {t(WEIGHT_LABEL_KEYS[top])} · {weights[top]}%
        </p>
      </div>
      {/* nowrap + shrink-0: at 375px this badge was breaking across two
          lines and shoving itself into the description text. */}
      <span
        data-testid="weight-total"
        className={`shrink-0 self-start whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold sm:px-3 sm:text-sm ${isTotalValid ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-status-rejected"}`}
      >
        {t("totalLabel")} {total}% {isTotalValid ? "✓" : t("need100")}
      </span>
    </div>
  );
}

interface WeightSliderRowProps {
  weightKey: WeightKey;
  value: number;
  onChange: (value: number) => void;
  /** Prefix for the input id so two builders on one page never collide. */
  idPrefix?: string;
}

/** Label + description, then number box · % · slider on one row. */
export function WeightSliderRow({ weightKey, value, onChange, idPrefix = "weight" }: WeightSliderRowProps) {
  const t = useTranslations("employerMatchingWeights");
  const id = `${idPrefix}-${weightKey}`;
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-3 sm:rounded-3xl sm:p-4">
      <div className="max-w-2xl">
        <label htmlFor={id} className="text-sm font-semibold text-foreground">{t(WEIGHT_LABEL_KEYS[weightKey])}</label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(WEIGHT_DESC_KEYS[weightKey])}</p>
      </div>
      {/* Number box and slider share one row — stacked they burned a
          full extra line of height per weight, five times over. */}
      <div className="mt-2 flex items-center gap-2 sm:mt-3 sm:gap-3">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="h-9 w-16 shrink-0 border-border bg-background/80 text-center text-sm sm:h-10 sm:w-20"
        />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">%</span>
        <input
          type="range"
          aria-label={t(WEIGHT_LABEL_KEYS[weightKey])}
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-sky-600"
        />
      </div>
    </div>
  );
}

interface WeightDistributionPanelProps {
  weights: WeightMap;
  total: number;
  headingLevel?: 2 | 3;
}

/** The bar-per-weight overview plus the balanced / adjust hint. */
export function WeightDistributionPanel({ weights, total, headingLevel = 2 }: WeightDistributionPanelProps) {
  const t = useTranslations("employerMatchingWeights");
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const isTotalValid = total === 100;
  return (
    <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("distribution")}</p>
        <Heading className="heading-subsection mt-2 font-semibold text-foreground">{t("weightOverview")}</Heading>
      </div>
      <div className="space-y-3">
        {WEIGHT_KEYS.map((key) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t(WEIGHT_LABEL_KEYS[key])}</span>
              <span className="font-medium text-foreground">{weights[key]}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${weights[key]}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-2xl p-4 text-sm ${isTotalValid ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-status-shortlisted"}`}>
        {isTotalValid ? `✓ ${t("balancedCorrectly")}` : `⚠ ${t("totalAdjustHint", { total })}`}
      </div>
    </section>
  );
}

/** The tuning guidance card under the distribution panel. */
export function WeightTuningPanel({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const t = useTranslations("employerMatchingWeights");
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className="rounded-3xl border border-border bg-background/60 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.28)] panel-body">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("tuningGuidance")}</p>
      <Heading className="heading-subsection mt-2 font-semibold text-foreground">{t("tuningTitle")}</Heading>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("tuningBody")}</p>
    </section>
  );
}
