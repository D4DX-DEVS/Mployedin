"use client";

import { Download, FileText, MessageSquareWarning, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { useGdprLabels } from "./useGdprLabels";

const TYPE_ICONS: Record<string, LucideIcon> = {
  export: Download,
  delete: Trash2,
  rectification: FileText,
  restrict: XCircle,
  complaint: MessageSquareWarning,
};

/**
 * A request's type: its icon and its name. The label is one unbreakable line
 * and the icon never shrinks, so a squeezed row (a phone card with two buttons
 * beside it) wraps around the label instead of breaking it letter by letter.
 */
export function RequestTypeLabel({ type }: { type: string }) {
  const { typeLabel } = useGdprLabels();
  const Icon = TYPE_ICONS[type];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm">
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      {typeLabel(type)}
    </span>
  );
}
