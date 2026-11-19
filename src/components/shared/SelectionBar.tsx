"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CV_EXPORT_MAX_ITEMS } from "@/lib/cv/cvExportTypes";
import { cn } from "@/lib/utils";

interface SelectionBarProps {
  /** Rows ticked. The bar renders nothing for 0. */
  count: number;
  onClear: () => void;
  /** The actions that apply to the selection (a bulk menu, `ExportCvsButton`), at the end of the bar. */
  children?: ReactNode;
  className?: string;
}

/**
 * "N selected · Clear · actions" for a list with row checkboxes. Sticky at the
 * bottom of the page content. Put it at the end of the page, after the
 * pagination, so it sticks while the list is in view.
 *
 * `bottom-0` is deliberate: the dashboard's scroll container reserves bottom
 * padding for the phone tab bar and the floating assistant button, and a sticky
 * offset is measured from inside that padding, so the bar rests just above both
 * with no offset of its own (an offset here was counted twice and floated it
 * a third of the way up the screen).
 */
export function SelectionBar({ count, onClear, children, className }: SelectionBarProps) {
  const t = useTranslations("selectionBar");
  if (count < 1) return null;
  return (
    <div
      role="region"
      aria-label={t("barLabel")}
      className={cn(
        "sticky bottom-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/90",
        className,
      )}
    >
      <span aria-live="polite" className="text-sm font-semibold text-foreground">{t("selectedCount", { count })}</span>
      <Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={onClear} aria-label={t("clearSelection")}>
        {t("clear")}
      </Button>
      {children && <div className="ms-auto flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

interface ExportCvsButtonProps {
  /** Candidates the export would cover. */
  count: number;
  onClick: () => void;
  /** "outline" where another action in the bar is the primary one. */
  variant?: "default" | "outline";
}

/**
 * Opens the CV export for the selection. An export covers at most
 * CV_EXPORT_MAX_ITEMS candidates (owner decision 4A): above that the button is
 * disabled, and says why as a tooltip (a disabled button takes no hover, so the
 * wrapper carries it) and in words, which is what a touch screen has.
 */
export function ExportCvsButton({ count, onClick, variant = "default" }: ExportCvsButtonProps) {
  const t = useTranslations("selectionBar");
  const reasonId = useId();
  const tooMany = count > CV_EXPORT_MAX_ITEMS;
  const reason = t("exportLimit", { max: CV_EXPORT_MAX_ITEMS });
  return (
    <>
      {tooMany && <span id={reasonId} className="text-xs text-amber-700">{reason}</span>}
      <span title={tooMany ? reason : undefined} className="inline-flex">
        <Button size="sm" variant={variant} className="max-sm:min-h-11" disabled={tooMany} aria-describedby={tooMany ? reasonId : undefined} onClick={onClick}>
          <Download aria-hidden="true" />
          {t("exportCvs")}
        </Button>
      </span>
    </>
  );
}
