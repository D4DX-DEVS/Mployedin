"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface StatusPillTabsProps<T extends string> {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  /** Accessible name of the tablist, e.g. t("statusFiltersLabel"). */
  label: string;
  /** Visible label for a tab, e.g. (tab) => t(`status.${tab}`). */
  renderLabel: (tab: T) => string;
  /**
   * How many records the tab would show. Rendered beside the label so a tab's
   * number and its list can never appear to disagree. Return `undefined` while
   * counts are still loading or unavailable — the pill then shows label only.
   */
  renderCount?: (tab: T) => number | undefined;
  /** Ids become `${idPrefix}-tab-${tab}` / `${idPrefix}-panel-${tab}`; the page's tabpanel must use the same. */
  idPrefix: string;
  className?: string;
}

/**
 * Resolves right-to-left reading direction from the DOM at the moment a key
 * is handled, so the component stays self-contained and correct under
 * `dir="rtl"` wherever it is mounted (no locale prop to keep in sync).
 * Walks up to the closest `[dir]` ancestor (inclusive) rather than reading
 * `getComputedStyle(...).direction`: jsdom does not resolve `direction`
 * inherited from an ancestor's `dir` attribute, and this component's own
 * `rtl:` Tailwind variant below is already driven by the same `[dir="rtl"]`
 * ancestor match, so this keeps both mechanisms consistent. Defaults to
 * left-to-right when no `dir` is resolvable.
 */
function isRtl(element: HTMLElement | null): boolean {
  return element?.closest("[dir]")?.getAttribute("dir")?.toLowerCase() === "rtl";
}

/**
 * The status filter row every journey list shares.
 *
 * Phones: no enclosing pill — a closed border made the cut-off last tab read
 * as a broken control; free-standing chips that run past the edge read as a
 * scrollable carousel instead. The pill frame and fade mask return at sm+,
 * where most tabs fit.
 */
export function StatusPillTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
  renderLabel,
  renderCount,
  idPrefix,
  className,
}: StatusPillTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  // Roving tabindex + automatic activation (WAI-ARIA APG tabs pattern).
  // Queried fresh on every keypress instead of cached in a ref array, so this
  // stays correct even when `tabs` changes length between renders.
  const focusTabAt = (index: number) => {
    const tabButtons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons?.[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.indexOf(active);
    if (currentIndex === -1) return;

    // Arrow-key direction follows reading direction: in a right-to-left row
    // the first tab renders rightmost, so ArrowRight/ArrowLeft must swap
    // meaning for the move to match what the user visually sees. Home/End
    // stay logical (first/last in DOM order) regardless of direction.
    const rtl = isRtl(listRef.current);
    const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
    const previousKey = rtl ? "ArrowRight" : "ArrowLeft";

    let nextIndex: number;
    switch (event.key) {
      case nextKey:
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case previousKey:
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(tabs[nextIndex]);
    focusTabAt(nextIndex);
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="scrollbar-none flex snap-x snap-proximity items-center gap-1.5 overflow-x-auto sm:gap-1 sm:rounded-full sm:border sm:border-border/70 sm:bg-muted/20 sm:p-1 sm:[mask-image:linear-gradient(to_right,black_92%,transparent)] sm:rtl:[mask-image:linear-gradient(to_left,black_92%,transparent)] lg:[mask-image:none] lg:rtl:[mask-image:none]"
      >
        {tabs.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              id={`${idPrefix}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${idPrefix}-panel-${tab}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab)}
              className={cn(
                "relative min-h-11 shrink-0 snap-start rounded-full border px-3 py-2 text-xs font-medium transition-colors duration-200 sm:min-h-0 sm:border-0 sm:px-3.5 sm:py-1.5 sm:text-sm sm:shadow-none",
                isActive
                  ? "border-transparent text-primary-foreground"
                  : "border-border/60 bg-background text-muted-foreground shadow-sm hover:bg-muted/60 hover:text-foreground sm:bg-transparent"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`${idPrefix}-status-pill`}
                  className="absolute inset-0 rounded-full bg-primary shadow-[0_10px_22px_rgba(37,99,235,0.24)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {renderLabel(tab)}
                {(() => {
                  const count = renderCount?.(tab);
                  if (count == null) return null;
                  return (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                        isActive ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {count}
                    </span>
                  );
                })()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
