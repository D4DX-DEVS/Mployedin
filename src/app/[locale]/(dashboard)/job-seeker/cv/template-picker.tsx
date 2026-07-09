"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check, Image as ImageIcon, Pipette } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { FormattingOptions, TemplateDefinition, SectionKey } from "./types";
import {
  TEMPLATES, THEME_COLORS, FONT_OPTIONS, DEFAULT_FORMATTING,
  PAGE_FORMAT_OPTIONS, DATE_FORMAT_OPTIONS, LINE_HEIGHT_OPTIONS, MARGIN_OPTIONS,
  SECTION_META, getSectionOrder, resolveTheme,
} from "./types";
import { SortableList, SortableItem } from "./sortable";

/* ─────────────────────────────────────
   Template Picker (grid of thumbnails)
   ───────────────────────────────────── */

/** Miniature preview SVG placeholder for each template */
function TemplateThumbnail({ template, themeColor }: { template: TemplateDefinition; themeColor: string }) {
  const c = resolveTheme(themeColor).primary;

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
    professional: (
      <>
        <rect x="0" y="0" width="60" height="15" fill={c} />
        <circle cx="9" cy="7.5" r="4.5" fill="white" opacity="0.85" />
        <rect x="17" y="5" width="28" height="2.5" rx="0.5" fill="white" />
        <rect x="17" y="9" width="22" height="1" rx="0.5" fill="white" opacity="0.6" />
        <rect x="4" y="19" width="34" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="4" y="22" width="34" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="4" y="25" width="30" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="42" y="19" width="14" height="1.5" rx="0.5" fill={c} opacity="0.5" />
        <rect x="42" y="23" width="14" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="42" y="26" width="14" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    compact: (
      <>
        <rect x="6" y="5" width="34" height="2.5" rx="0.5" fill={c} />
        <rect x="6" y="9" width="24" height="1" rx="0.5" fill="#d1d5db" />
        <rect x="6" y="13" width="16" height="1.5" rx="0.5" fill={c} opacity="0.5" />
        <rect x="6" y="16" width="48" height="0.8" rx="0.4" fill="#e5e7eb" />
        <rect x="6" y="18" width="48" height="0.8" rx="0.4" fill="#e5e7eb" />
        <rect x="6" y="20" width="44" height="0.8" rx="0.4" fill="#e5e7eb" />
        <rect x="6" y="24" width="16" height="1.5" rx="0.5" fill={c} opacity="0.5" />
        <rect x="6" y="27" width="48" height="0.8" rx="0.4" fill="#e5e7eb" />
        <rect x="6" y="29" width="48" height="0.8" rx="0.4" fill="#e5e7eb" />
        <rect x="6" y="31" width="40" height="0.8" rx="0.4" fill="#e5e7eb" />
      </>
    ),
    timeline: (
      <>
        <rect x="8" y="5" width="30" height="3" rx="1" fill={c} />
        <rect x="8" y="10" width="20" height="1" rx="0.5" fill="#d1d5db" />
        <line x1="11" y1="16" x2="11" y2="38" stroke={c} strokeWidth="0.6" opacity="0.4" />
        <circle cx="11" cy="18" r="1.6" fill={c} />
        <rect x="16" y="17" width="38" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="16" y="20" width="34" height="1" rx="0.5" fill="#e5e7eb" />
        <circle cx="11" cy="27" r="1.6" fill={c} />
        <rect x="16" y="26" width="38" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="16" y="29" width="30" height="1" rx="0.5" fill="#e5e7eb" />
        <circle cx="11" cy="35" r="1.6" fill={c} />
        <rect x="16" y="34" width="34" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    academic: (
      <>
        <rect x="14" y="5" width="32" height="3" rx="0.5" fill={c} />
        <rect x="20" y="10" width="20" height="1" rx="0.5" fill="#d1d5db" />
        <line x1="8" y1="14" x2="52" y2="14" stroke={c} strokeWidth="0.7" />
        <rect x="22" y="17" width="16" height="1.5" rx="0.5" fill={c} opacity="0.6" />
        <line x1="8" y1="20" x2="52" y2="20" stroke="#e5e7eb" strokeWidth="0.4" />
        <rect x="8" y="22" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="8" y="25" width="40" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="22" y="29" width="16" height="1.5" rx="0.5" fill={c} opacity="0.6" />
        <rect x="8" y="33" width="44" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    technical: (
      <>
        <rect x="6" y="4" width="48" height="11" rx="1" fill={c} opacity="0.12" />
        <rect x="9" y="6.5" width="26" height="2.5" rx="0.5" fill={c} />
        <rect x="9" y="10.5" width="18" height="1" rx="0.5" fill="#9ca3af" />
        <rect x="6" y="19" width="3" height="1.5" rx="0.3" fill={c} opacity="0.5" />
        <rect x="11" y="19" width="16" height="1.5" rx="0.5" fill={c} opacity="0.5" />
        <rect x="6" y="23" width="48" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="6" y="26" width="42" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="6" y="31" width="3" height="1.5" rx="0.3" fill={c} opacity="0.5" />
        <rect x="11" y="31" width="16" height="1.5" rx="0.5" fill={c} opacity="0.5" />
        <rect x="6" y="35" width="48" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
    banner: (
      <>
        <rect x="0" y="0" width="60" height="16" fill={c} />
        <circle cx="10" cy="8" r="4.5" fill="white" opacity="0.85" />
        <rect x="18" y="5.5" width="30" height="2.5" rx="0.5" fill="white" />
        <rect x="18" y="9.5" width="22" height="1" rx="0.5" fill="white" opacity="0.6" />
        <rect x="6" y="20" width="16" height="1.5" rx="0.5" fill={c} opacity="0.6" />
        <rect x="6" y="24" width="48" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="6" y="27" width="44" height="1" rx="0.5" fill="#e5e7eb" />
        <rect x="6" y="32" width="16" height="1.5" rx="0.5" fill={c} opacity="0.6" />
        <rect x="6" y="36" width="48" height="1" rx="0.5" fill="#e5e7eb" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 60 44" className="w-full rounded border border-border bg-card" preserveAspectRatio="xMidYMid meet">
      {layouts[template.id] ?? layouts.classic}
    </svg>
  );
}

export function TemplatePicker({
  selected,
  onSelect,
  themeColor,
}: {
  selected: string;
  onSelect: (id: string) => void;
  themeColor: string;
}) {
  const t = useTranslations("cvBuilderPage.templatePicker");

  return (
    <div className="space-y-4">
      {/* Template grid — all templates available, no tiers */}
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.map((template) => {
          const isSelected = selected === template.id;

          return (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={cn(
                "relative rounded-xl border-2 p-2.5 text-left transition-all",
                isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-border/80",
              )}
            >
              {/* "Photo" badge for templates that support a profile picture */}
              {template.supportsPhoto && (
                <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-primary">
                  <ImageIcon className="h-2.5 w-2.5" /> {t("badges.photo")}
                </span>
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
        <div className="flex flex-wrap items-center gap-2.5">
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

          {/* Custom color picker — choose any color from the palette */}
          {(() => {
            const isCustom = !THEME_COLORS.some((c) => c.id === formatting.themeColor);
            const currentHex = isCustom ? formatting.themeColor : "#2563eb";
            return (
              <label
                className={cn(
                  "relative w-8 h-8 rounded-full cursor-pointer transition-all flex items-center justify-center overflow-hidden",
                  isCustom && "ring-2 ring-offset-2 ring-offset-background"
                )}
                style={{
                  background: isCustom
                    ? currentHex
                    : "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
                  ...(isCustom ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${currentHex}` } : {}),
                }}
                title={t("customColor")}
              >
                <input
                  type="color"
                  value={currentHex}
                  onChange={(e) => onChange({ ...formatting, themeColor: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={t("customColor")}
                />
                <Pipette className="w-3.5 h-3.5 text-white drop-shadow" />
              </label>
            );
          })()}
        </div>
      </div>

      {/* Page format + Date format row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("pageFormat")}</label>
          <Select value={formatting.pageFormat} onValueChange={(v) => onChange({ ...formatting, pageFormat: v as FormattingOptions["pageFormat"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(`pageFormats.${o.value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("dateFormat")}</label>
          <Select value={formatting.dateFormat} onValueChange={(v) => onChange({ ...formatting, dateFormat: v as FormattingOptions["dateFormat"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Line height + Margin row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("lineHeight")}</label>
          <Select value={formatting.lineHeight} onValueChange={(v) => onChange({ ...formatting, lineHeight: v as FormattingOptions["lineHeight"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINE_HEIGHT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(`lineHeights.${o.value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">{t("margin")}</label>
          <Select value={formatting.margin} onValueChange={(v) => onChange({ ...formatting, margin: v as FormattingOptions["margin"] })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MARGIN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{t(`margins.${o.value}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section order arranger */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">{t("arrangeSections")}</label>
        <p className="text-[0.65rem] text-muted-foreground mb-2">{t("arrangeSectionsHint")}</p>
        <SortableList
          ids={getSectionOrder(formatting)}
          onReorder={(ids) => onChange({ ...formatting, sectionOrder: ids as SectionKey[] })}
          className="space-y-1.5"
        >
          {getSectionOrder(formatting).map((key) => (
            <SortableItem
              key={key}
              id={key}
              className="group flex items-center rounded-md border border-border bg-card pl-7 pr-3 py-1.5 text-xs"
            >
              <span className="font-medium">{t(`sections.${key}`)}</span>
            </SortableItem>
          ))}
        </SortableList>
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
