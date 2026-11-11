"use client";

import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * On a phone the profile showed every section fully open, about 5,100px of
 * scrolling. These two helpers keep each section to a short preview there and
 * let the seeker open the rest in place. From `sm` up nothing is hidden, so
 * the desktop page reads exactly as before.
 */

interface ToggleProps {
  expanded: boolean;
  onToggle: () => void;
  collapsedLabel: string;
}

function PhoneToggle({ expanded, onToggle, collapsedLabel }: ToggleProps) {
  const t = useTranslations("jobSeekerExtra.profile.sectionActions");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary sm:hidden"
    >
      {expanded ? t("showLess") : collapsedLabel}
      <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
    </button>
  );
}

interface PhonePreviewListProps {
  /** Items to show on a phone before "Show all". */
  limit: number;
  /** Classes for the wrapper that holds the items (layout: space-y, flex-wrap…). */
  className?: string;
  children: ReactNode;
}

/** A list that shows its first `limit` items on a phone, with "Show all (N)". */
export function PhonePreviewList({ limit, className, children }: PhonePreviewListProps) {
  const t = useTranslations("jobSeekerExtra.profile.sectionActions");
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const overflow = items.length > limit;
  const collapsed = overflow && !expanded;

  // The class goes on the item itself (no wrapper), so margin-based spacing
  // (space-y) keeps working from sm up. The last item still shown drops its
  // divider, which otherwise sat between it and "Show all".
  const withPhoneClass = (item: ReactNode, extra: string): ReactNode =>
    isValidElement<{ className?: string }>(item)
      ? cloneElement(item as ReactElement<{ className?: string }>, { className: cn(item.props.className, extra) })
      : item;

  return (
    <>
      <div className={className}>
        {items.map((item, i) => {
          if (!collapsed) return item;
          if (i >= limit) return withPhoneClass(item, "max-sm:hidden");
          if (i === limit - 1) return withPhoneClass(item, "max-sm:border-b-0 max-sm:pb-0");
          return item;
        })}
      </div>
      {overflow && (
        <PhoneToggle
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          collapsedLabel={t("showAll", { count: items.length })}
        />
      )}
    </>
  );
}

interface PhoneClampTextProps {
  text: string;
  className?: string;
}

/** Long text clamped to four lines on a phone, with "Read more". */
export function PhoneClampText({ text, className }: PhoneClampTextProps) {
  const t = useTranslations("jobSeekerExtra.profile.sectionActions");
  const [expanded, setExpanded] = useState(false);
  // ~4 phone lines; shorter text never shows a toggle.
  const long = text.length > 220;

  return (
    <>
      <p className={cn(className, long && !expanded && "max-sm:line-clamp-4")}>{text}</p>
      {long && (
        <PhoneToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} collapsedLabel={t("readMore")} />
      )}
    </>
  );
}
