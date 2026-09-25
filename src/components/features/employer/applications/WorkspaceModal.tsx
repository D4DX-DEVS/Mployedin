"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveViewerTimeZone, timeZoneLabel } from "@/lib/datetime/zone";

interface WorkspaceModalProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  /**
   * Receives the dialog element. Pickers inside must portal into it
   * (`container` + `modal`), or the dialog's scroll lock swallows their wheel.
   */
  contentRef?: (el: HTMLDivElement | null) => void;
  /** Width, e.g. `max-w-md` — the shared dialog honours a declared width. */
  className?: string;
  children: ReactNode;
}

/**
 * The hiring workspace's action modals (schedule interview, bulk schedule,
 * offer, email preview, scorecard). They were hand-rolled `fixed z-[60]`
 * overlays with no dialog role, no Escape and no focus trap, and the PWA
 * install card (z-[110]) painted over them (audit 2026-09-24, JRN-03).
 *
 * The header keeps the workspace's own type scale: the shared DialogTitle adds
 * `text-lg`, which would override `heading-section`. A click outside still does
 * nothing, as before, so a half-filled form is not lost to a stray click;
 * Escape and Cancel close it.
 */
export function WorkspaceModal({
  title,
  description,
  icon,
  onClose,
  contentRef,
  className,
  children,
}: WorkspaceModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        ref={contentRef}
        hideClose
        mobileSheet={false}
        onInteractOutside={(e) => e.preventDefault()}
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn("w-[calc(100%-2rem)] gap-0 rounded-lg p-0 shadow-lg sm:gap-0 sm:p-0", className)}
      >
        <div className="px-6 py-4 border-b border-border">
          <DialogPrimitive.Title className={cn("heading-section font-semibold", icon && "flex items-center gap-2")}>
            {icon}
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Interviews are booked in the viewer's own zone; the picker never said which
 * one (JRN-03). Only mounted inside a modal opened by a click, so reading the
 * runtime's zone cannot cause a hydration mismatch.
 */
export function ViewerZoneHint({ at }: { at?: string }) {
  const t = useTranslations("employerApplications");
  const locale = useLocale();
  const zone = timeZoneLabel(at || new Date(), resolveViewerTimeZone(), locale);
  if (!zone) return null;
  return <p className="text-[11px] text-muted-foreground -mt-2">{t("ivTimeZoneHint", { zone })}</p>;
}
