"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { FormattingOptions, TemplateDefinition } from "./types";
import {
  TEMPLATES, THEME_COLORS, FONT_OPTIONS, DEFAULT_FORMATTING,
} from "./types";

/* ─────────────────────────────────────
   Template Picker (grid of thumbnails)
   ───────────────────────────────────── */

/** Miniature preview SVG placeholder for each template */
function TemplateThumbnail({ template, themeColor }: { template: TemplateDefinition; themeColor: string }) {
  const c = THEME_COLORS.find((t) => t.id === themeColor)?.primary ?? "#2563eb";

  const layouts: Record<string, React.ReactNode> = {
    classic: (
      <>
        <rect x="8" y="6" width="44" height="3" rx="1" fill={c} />
        <rect x="8" y="11" width="30" height="1.5" rx="0.5" fill="#d1d5db" />
        <rect x="8" y="16" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="19" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="22" width="40" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="27" width="20" height="2" rx="0.5" fill={c} opacity="0.6" />
        <rect x="8" y="31" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="34" width="44" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    modern: (
      <>
        <rect x="0" y="0" width="22" height="44" fill={c} />
        <rect x="4" y="5" width="14" height="2.5" rx="0.5" fill="white" />
        <rect x="4" y="10" width="12" height="1" rx="0.5" fill="white" opacity="0.6" />
        <rect x="4" y="14" width="14" height="1" rx="0.5" fill="white" opacity="0.4" />
        <rect x="26" y="6" width="30" height="2" rx="0.5" fill="#d1d5db" />
        <rect x="26" y="10" width="30" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="26" y="13" width="30" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="26" y="18" width="20" height="2" rx="0.5" fill={c} opacity="0.5" />
        <rect x="26" y="22" width="30" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="26" y="25" width="30" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    minimal: (
      <>
        <rect x="14" y="5" width="32" height="3" rx="1" fill={c} />
        <rect x="18" y="10" width="24" height="1" rx="0.5" fill="#d1d5db" />
        <rect x="8" y="16" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="19" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="22" width="38" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="28" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="31" width="44" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    executive: (
      <>
        <rect x="0" y="0" width="60" height="12" fill={c} />
        <circle cx="10" cy="6" r="3.5" fill="white" opacity="0.3" />
        <rect x="16" y="4" width="28" height="2" rx="0.5" fill="white" />
        <rect x="16" y="7.5" width="20" height="1" rx="0.5" fill="white" opacity="0.6" />
        <rect x="4" y="16" width="32" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="4" y="19" width="32" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="40" y="16" width="16" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="40" y="19" width="16" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    creative: (
      <>
        <rect x="0" y="0" width="60" height="14" fill={c} />
        <rect x="4" y="4" width="30" height="3" rx="0.5" fill="white" />
        <rect x="4" y="8.5" width="20" height="1" rx="0.5" fill="white" opacity="0.6" />
        <rect x="4" y="18" width="24" height="1.5" rx="1" fill={c} opacity="0.3" />
        <rect x="4" y="21" width="20" height="1.5" rx="1" fill={c} opacity="0.3" />
        <rect x="32" y="18" width="24" height="1.5" rx="1" fill={c} opacity="0.3" />
        <rect x="32" y="21" width="20" height="1.5" rx="1" fill={c} opacity="0.3" />
        <rect x="4" y="27" width="52" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="4" y="30" width="52" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    elegant: (
      <>
        <rect x="12" y="5" width="36" height="2.5" rx="0.5" fill={c} />
        <rect x="18" y="9" width="24" height="1" rx="0.5" fill="#d1d5db" />
        <line x1="10" y1="13" x2="50" y2="13" stroke={c} strokeWidth="0.5" opacity="0.4" />
        <rect x="26" y="11.5" width="3" height="3" fill={c} transform="rotate(45 27.5 13)" />
        <rect x="8" y="18" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="21" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="27" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="30" width="44" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 60 44" className="w-full rounded border border-gray-200 bg-white" preserveAspectRatio="xMidYMid meet">
      {layouts[template.id] ?? layouts.classic}
    </svg>
  );
}

export function TemplatePicker({
  selected,
  onSelect,
  themeColor,
  filter,
  onFilterChange,
  hasProAccess,
}: {
  selected: string;
  onSelect: (id: string) => void;
  themeColor: string;
  filter: "all" | "free" | "pro";
  onFilterChange: (f: "all" | "free" | "pro") => void;
  hasProAccess: boolean;
}) {
  const t = useTranslations("cvBuilderPage.templatePicker");
  const filtered = TEMPLATES.filter((template) => filter === "all" ? true : template.tier === filter);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2">
        {(["all", "free", "pro"] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all capitalize",
              filter === f
                ? f === "pro"
                  ? "bg-orange-500 text-white"
                  : "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {f === "pro" ? t("filters.pro") : f === "all" ? t("filters.all") : t("filters.free")}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((template) => {
          const isSelected = selected === template.id;
          const locked = template.tier === "pro" && !hasProAccess;

          return (
            <button
              key={template.id}
              onClick={() => !locked && onSelect(template.id)}
              className={cn(
                "relative rounded-xl border-2 p-2.5 text-left transition-all",
                isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-border/80",
                locked && "opacity-60 cursor-not-allowed",
              )}
            >
              {/* Badge */}
              <span
                className={cn(
                  "absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[0.6rem] font-bold uppercase",
                  template.tier === "pro" ? "bg-orange-500 text-white" : "bg-emerald-500 text-white"
                )}
              >
                {template.tier === "pro" ? t("badges.pro") : t("badges.free")}
              </span>

              {/* Locked overlay */}
              {locked && (
                <div className="absolute inset-0 rounded-xl bg-background/50 flex items-center justify-center z-10">
                  <Crown className="w-5 h-5 text-orange-500" />
                </div>
              )}

              {/* Thumbnail */}
              <TemplateThumbnail template={template} themeColor={themeColor} />

              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Label */}
              <p className="mt-1.5 text-xs font-medium">{t(`templates.${template.id}.name`)}</p>
              <p className="text-[0.65rem] text-muted-foreground">{t(`templates.${template.id}.description`)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────
   Formatting Panel
   ───────────────────────────────────── */

export function FormattingPanel({
  formatting,
  onChange,
}: {
  formatting: FormattingOptions;
  onChange: (f: FormattingOptions) => void;
}) {
  const t = useTranslations("cvBuilderPage.formatting");
  return (
    <div className="space-y-5">
      {/* Section Spacing */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">{t("sectionSpacing")}</label>
        <Select value={formatting.spacing} onValueChange={(v) => onChange({ ...formatting, spacing: v as FormattingOptions["spacing"] })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">{t("spacing.compact")}</SelectItem>
            <SelectItem value="medium">{t("spacing.medium")}</SelectItem>
            <SelectItem value="spacious">{t("spacing.spacious")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Font + Size row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("selectFont")}</label>
          <Select value={formatting.font} onValueChange={(v) => onChange({ ...formatting, font: v as FormattingOptions["font"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("fontSize")}</label>
          <Select value={formatting.fontSize} onValueChange={(v) => onChange({ ...formatting, fontSize: v as FormattingOptions["fontSize"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">{t("sizes.small")}</SelectItem>
              <SelectItem value="medium">{t("sizes.medium")}</SelectItem>
              <SelectItem value="large">{t("sizes.large")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Theme colors */}
      <div>
        <label className="text-xs font-medium text-foreground mb-2 block">{t("theme")}</label>
        <div className="flex gap-2.5">
          {THEME_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => onChange({ ...formatting, themeColor: c.id })}
              className={cn(
                "w-8 h-8 rounded-full transition-all flex items-center justify-center",
                formatting.themeColor === c.id && "ring-2 ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: c.primary, ...(formatting.themeColor === c.id ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${c.primary}` } : {}) }}
              title={c.label}
            >
              {formatting.themeColor === c.id && <Check className="w-4 h-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Reset + Save row */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => onChange(DEFAULT_FORMATTING)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
