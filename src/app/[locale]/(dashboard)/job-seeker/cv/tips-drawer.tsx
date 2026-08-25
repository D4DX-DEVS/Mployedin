"use client";

/* ── Contextual "Resume Tips" slide-over ──
   Right-side drawer with per-section writing guidance. Highlights the section
   the user is currently editing. Built on Radix Dialog for accessibility.
*/

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Lightbulb, X, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SectionKey } from "./types";

type TipKey = "general" | "summary" | SectionKey;

export type { TipKey };

const TIP_KEYS: TipKey[] = [
  "general", "summary", "experience", "education", "skills", "projects", "languages", "certifications",
];

export function TipsDrawer({
  open, onOpenChange, activeSection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSection?: TipKey | null;
}) {
  const t = useTranslations("cvBuilderPage.tips");

  // Active section first, then the rest in canonical order.
  const ordered = activeSection
    ? [activeSection, ...TIP_KEYS.filter((k) => k !== activeSection)]
    : TIP_KEYS;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed end-0 top-0 z-[10000] flex h-full w-full max-w-sm flex-col border-s border-border bg-background shadow-2xl",
            "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold">{t("title")}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">{t("subtitle")}</DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">{t("close")}</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {ordered.map((key) => {
              const raw = t.raw(`${key}.items`);
              const items = Array.isArray(raw) ? (raw as string[]) : [];
              if (items.length === 0) return null;
              const isActive = key === activeSection;
              return (
                <section
                  key={key}
                  className={cn(
                    "rounded-xl border p-3.5 transition-colors",
                    isActive ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
                  )}
                >
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                    {t(`${key}.title`)}
                    {isActive && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-medium normal-case text-primary-foreground">
                        {t("editingNow")}
                      </span>
                    )}
                  </h3>
                  <ul className="space-y-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
