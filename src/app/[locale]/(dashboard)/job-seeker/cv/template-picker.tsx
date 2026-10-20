"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Eye, Image as ImageIcon, Pipette, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { CVForm, FormattingOptions, TemplateDefinition, TemplateStyle, SectionKey } from "./types";
import {
  TEMPLATES, THEME_COLORS, FONT_OPTIONS, DEFAULT_FORMATTING,
  PAGE_FORMAT_OPTIONS, DATE_FORMAT_OPTIONS, LINE_HEIGHT_OPTIONS, MARGIN_OPTIONS,
  TEMPLATE_COLUMNS, getSectionOrder,
} from "./types";
import { SortableList, SortableItem } from "./sortable";
import { SAMPLE_CV, TemplateThumbnail, hasThumbnailContent } from "./template-thumbnail";
import { TemplatePreviewDialog } from "./template-preview-dialog";

/* ─────────────────────────────────────
   Template Picker (grid of thumbnails)
   ───────────────────────────────────── */

/** One filter at a time, so the gallery never lands on a confusing empty intersection. */
type TemplateFilter = "all" | "ats" | TemplateStyle | "photo";

const FILTERS: TemplateFilter[] = ["all", "ats", "modern", "minimal", "creative", "photo"];

function matchesFilter(template: TemplateDefinition, filter: TemplateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "ats") return Boolean(template.atsFriendly);
  if (filter === "photo") return Boolean(template.supportsPhoto);
  return template.style === filter;
}

/**
 * Gallery of real, scaled-down CVs. Every card renders the seeker's own CV in
 * that template (sample content until they have filled in the basics), so
 * picking a layout shows exactly what the preview and download will look like.
 */
export function TemplatePicker({
  selected,
  onSelect,
  data,
  formatting,
  wide = false,
}: {
  selected: string;
  onSelect: (id: string) => void;
  /** The CV as the preview shows it (hidden sections already removed). */
  data: CVForm;
  formatting: FormattingOptions;
  /** Live preview hidden: the gallery has the whole width, so show more (and bigger) cards per row. */
  wide?: boolean;
}) {
  const t = useTranslations("cvBuilderPage.templatePicker");
  const [filter, setFilter] = useState<TemplateFilter>("all");
  // Thumbnails re-render a whole CV each; let typing stay snappy.
  const deferredData = useDeferredValue(data);
  const usingSample = !hasThumbnailContent(deferredData);
  const thumbnailData = usingSample ? { ...SAMPLE_CV, photo: deferredData.photo } : deferredData;
  const visible = TEMPLATES.filter((tpl) => matchesFilter(tpl, filter));
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTemplate = TEMPLATES.find((tpl) => tpl.id === previewId) ?? null;

  return (
    <div className="space-y-4">
      {/* Stays in view while the gallery scrolls under it. */}
      <div
        className="sticky top-14 z-20 -mx-1 flex sm:top-16 flex-wrap items-center gap-2 bg-card/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        role="group"
        aria-label={t("filterLabel")}
      >
        {FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? "default" : "outline"}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="h-8 rounded-full text-xs"
          >
            {t(`filters.${f}`)}
          </Button>
        ))}
      </div>

      {usingSample && (
        <p className="text-xs text-muted-foreground">{t("sampleNotice")}</p>
      )}

      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4", wide ? "xl:grid-cols-4" : "lg:grid-cols-2")}>
        {visible.map((template) => {
          const isSelected = selected === template.id;
          const name = t(`templates.${template.id}.name`);

          return (
            <div
              key={template.id}
              className={cn(
                "group relative flex flex-col rounded-xl border-2 bg-muted/30 p-2.5 transition-all",
                isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
              )}
            >
              <TemplateThumbnail templateId={template.id} data={thumbnailData} formatting={formatting} />

              {isSelected && (
                <span className="absolute start-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground shadow-sm">
                  <Check aria-hidden="true" className="h-3 w-3" /> {t("badges.selected")}
                </span>
              )}

              <div className="mt-2 min-w-0">
                <p className="text-sm font-semibold">{name}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t(`templates.${template.id}.description`)}</p>
              </div>

              <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {template.atsFriendly && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
                      <ShieldCheck aria-hidden="true" className="h-3 w-3" /> {t("badges.ats")}
                    </span>
                  )}
                  {template.supportsPhoto && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
                      <ImageIcon aria-hidden="true" className="h-3 w-3" /> {t("badges.photo")}
                    </span>
                  )}
                </div>
                {/* Above the card's select button: looking never changes the selection. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewId(template.id)}
                  aria-label={t("previewTemplate", { name })}
                  className="relative z-10 h-8 shrink-0 gap-1 bg-background px-2.5 text-xs"
                >
                  <Eye aria-hidden="true" className="h-3.5 w-3.5" /> {t("preview")}
                </Button>
              </div>

              {/* Whole card is the hit area; the thumbnail inside is inert. */}
              <button
                type="button"
                onClick={() => onSelect(template.id)}
                aria-pressed={isSelected}
                aria-label={t("selectTemplate", { name })}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
            </div>
          );
        })}
      </div>

      <TemplatePreviewDialog
        template={previewTemplate}
        templates={visible.some((tpl) => tpl.id === previewId) ? visible : TEMPLATES}
        selected={selected}
        data={thumbnailData}
        formatting={formatting}
        onNavigate={setPreviewId}
        onUse={(id) => { onSelect(id); setPreviewId(null); }}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}

/* ─────────────────────────────────────
   Formatting Panel
   ───────────────────────────────────── */

export function FormattingPanel({
  formatting,
  onChange,
  templateId,
}: {
  formatting: FormattingOptions;
  onChange: (f: FormattingOptions) => void;
  /** The selected template; two-column templates show which column each section lives in. */
  templateId?: string;
}) {
  const t = useTranslations("cvBuilderPage.formatting");
  const columns = templateId && templateId in TEMPLATE_COLUMNS
    ? TEMPLATE_COLUMNS[templateId as keyof typeof TEMPLATE_COLUMNS]
    : null;
  const columnOf = (key: SectionKey): "main" | "side" | null => {
    if (!columns) return null;
    return (columns.main as readonly SectionKey[]).includes(key) ? "main" : "side";
  };
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
        <p className="text-[0.65rem] text-muted-foreground mb-2">
          {t(columns ? "arrangeSectionsColumnsHint" : "arrangeSectionsHint")}
        </p>
        <SortableList
          ids={getSectionOrder(formatting)}
          onReorder={(ids) => onChange({ ...formatting, sectionOrder: ids as SectionKey[] })}
          className="space-y-1.5"
        >
          {getSectionOrder(formatting).map((key) => (
            <SortableItem
              key={key}
              id={key}
              className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card ps-7 pe-3 py-1.5 text-xs max-sm:min-h-11 max-sm:ps-12"
            >
              <span className="font-medium">{t(`sections.${key}`)}</span>
              {columnOf(key) ? (
                <span className="text-[0.65rem] text-muted-foreground">{t(`columns.${columnOf(key)}`)}</span>
              ) : null}
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
