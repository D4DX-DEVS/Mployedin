"use client";

import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { CVForm, FormattingOptions, TemplateDefinition } from "./types";
import { TemplateThumbnail } from "./template-thumbnail";

interface TemplatePreviewDialogProps {
  /** Template being inspected; null = closed. */
  template: TemplateDefinition | null;
  /** The gallery's current (filtered) list, for Previous / Next. */
  templates: TemplateDefinition[];
  selected: string;
  data: CVForm;
  formatting: FormattingOptions;
  onNavigate: (id: string) => void;
  onUse: (id: string) => void;
  onClose: () => void;
}

/**
 * Full-size look at one template before committing to it. Browsing here never
 * changes the seeker's selection; only "Use this template" does.
 */
export function TemplatePreviewDialog({
  template, templates, selected, data, formatting, onNavigate, onUse, onClose,
}: TemplatePreviewDialogProps) {
  const t = useTranslations("cvBuilderPage.templatePicker");
  const index = template ? templates.findIndex((tpl) => tpl.id === template.id) : -1;
  const prev = index > 0 ? templates[index - 1] : null;
  const next = index >= 0 && index < templates.length - 1 ? templates[index + 1] : null;
  const isSelected = template?.id === selected;

  function handleKeyDown(e: React.KeyboardEvent) {
    // Arrow keys flip templates, mirrored in Arabic so "forward" follows reading order.
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward && next) { e.preventDefault(); onNavigate(next.id); }
    if (e.key === back && prev) { e.preventDefault(); onNavigate(prev.id); }
  }

  return (
    <Dialog open={template !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:p-0"
        closeOnOutsideClick
        onKeyDown={handleKeyDown}
      >
        {template && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 pe-16 text-start">
              <DialogTitle>{t("previewTitle", { name: t(`templates.${template.id}.name`) })}</DialogTitle>
              <DialogDescription>{t(`templates.${template.id}.description`)}</DialogDescription>
              {(template.atsFriendly || template.supportsPhoto) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {template.atsFriendly && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> {t("badges.ats")}
                    </span>
                  )}
                  {template.supportsPhoto && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      <ImageIcon aria-hidden="true" className="h-3.5 w-3.5" /> {t("badges.photo")}
                    </span>
                  )}
                </div>
              )}
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/60 p-3 sm:p-6">
              <div className="mx-auto w-full max-w-[680px]">
                <TemplateThumbnail
                  key={template.id}
                  templateId={template.id}
                  data={data}
                  formatting={formatting}
                  fit="document"
                  className="rounded-sm shadow-lg ring-1 ring-border"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-9 sm:w-9"
                  disabled={!prev} onClick={() => prev && onNavigate(prev.id)} aria-label={t("previousTemplate")}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("position", { current: index + 1, total: templates.length })}
                </span>
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-9 sm:w-9"
                  disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label={t("nextTemplate")}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>

              {isSelected ? (
                <Button type="button" variant="secondary" onClick={onClose} className="min-h-11 gap-1.5 sm:min-h-9">
                  <Check aria-hidden="true" className="h-4 w-4" /> {t("inUseClose")}
                </Button>
              ) : (
                <Button type="button" onClick={() => onUse(template.id)} className="min-h-11 gap-1.5 sm:min-h-9">
                  <Check aria-hidden="true" className="h-4 w-4" /> {t("useThisTemplate")}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
