"use client";

import { useEffect } from "react";

const TABLE_SELECTOR = "table:not([data-mobile-table='scroll'])";

function getHeaderLabels(table: HTMLTableElement) {
  const headerRows = Array.from(table.tHead?.rows ?? []);
  const columnLabels: string[] = [];

  for (const row of headerRows) {
    let columnIndex = 0;

    for (const cell of Array.from(row.cells)) {
      while (columnLabels[columnIndex]) columnIndex += 1;

      const label =
        cell.getAttribute("data-mobile-label") ??
        cell.textContent?.replace(/\s+/g, " ").trim() ??
        "";
      const columnSpan = Math.max(cell.colSpan, 1);

      for (let index = 0; index < columnSpan; index += 1) {
        if (label) columnLabels[columnIndex + index] = label;
      }

      columnIndex += columnSpan;
    }
  }

  return columnLabels;
}

/** Cells kept visible while a card is collapsed. Everything after this is
 *  revealed on tap, mirroring the employer jobs list on phones. */
const SUMMARY_CELL_COUNT = 2;
let responsiveTableId = 0;

function getDisclosureLabels(table: HTMLTableElement) {
  const language = table.closest<HTMLElement>("[lang]")?.lang || document.documentElement.lang;
  const defaults = language.startsWith("ar")
    ? { expand: "إظهار التفاصيل", collapse: "إخفاء التفاصيل" }
    : { expand: "Show details", collapse: "Hide details" };

  return {
    expand: table.getAttribute("data-mobile-expand-label") || defaults.expand,
    collapse: table.getAttribute("data-mobile-collapse-label") || defaults.collapse,
  };
}

function setExpanded(row: HTMLTableRowElement, expanded: boolean) {
  row.toggleAttribute("data-mobile-expanded", expanded);
  row.setAttribute("aria-expanded", String(expanded));
  const labels = getDisclosureLabels(row.closest("table") as HTMLTableElement);
  row.setAttribute("aria-label", expanded ? labels.collapse : labels.expand);
}

/**
 * Make the row itself the disclosure control.
 *
 * This used to inject a 44x44 <button> into a cell React owns, which raced
 * hydration: on a streamed Suspense boundary the button landed before React
 * reconciled that cell, and React threw "Hydration failed" over the extra
 * child. No amount of deferral removes that race — so nothing is injected any
 * more. `aria-expanded` is valid on role="row" (tree grids use it), the chevron
 * affordance was already pure CSS (tr[data-mobile-collapsible]::after), and a
 * whole-row target is larger than the button it replaces.
 */
function markExpandable(row: HTMLTableRowElement, cells: HTMLTableCellElement[]) {
  const cellCount = cells.length;
  if (cellCount <= SUMMARY_CELL_COUNT + 1) return;
  if (row.hasAttribute("data-mobile-spanning-row")) return;
  row.setAttribute("data-mobile-collapsible", "");

  const table = row.closest("table");
  if (!table) return;
  if (!table.id) {
    responsiveTableId += 1;
    table.id = `responsive-table-${responsiveTableId}`;
  }

  const detailIds = cells.slice(SUMMARY_CELL_COUNT).map((cell, index) => {
    if (!cell.id) cell.id = `${table.id}-row-${row.rowIndex}-detail-${index + 1}`;
    return cell.id;
  });

  row.setAttribute("aria-controls", detailIds.join(" "));
  // Attributes only — no new element — so React never sees an unexpected child.
  if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "0");
  setExpanded(row, row.hasAttribute("data-mobile-expanded"));
}

/** Elements whose own click must win over expand/collapse. */
const INTERACTIVE = "button,a,input,select,textarea,label,[role=checkbox],[role=button],[role=menuitem]";

function enhanceTable(table: HTMLTableElement) {
  table.classList.add("responsive-card-table", "workspace-list-table");

  const headerLabels = getHeaderLabels(table);
  const sections: HTMLTableSectionElement[] = [
    ...Array.from(table.tBodies),
    ...(table.tFoot ? [table.tFoot] : []),
  ];

  for (const section of sections) {
    for (const row of Array.from(section.rows)) {
      let columnIndex = 0;
      const cells = Array.from(row.cells);
      const isSpanningRow =
        cells.length === 1 && cells[0].colSpan > 1;

      row.toggleAttribute("data-mobile-spanning-row", isSpanningRow);

      for (const cell of cells) {
        if (
          !cell.hasAttribute("data-label") ||
          cell.hasAttribute("data-responsive-label")
        ) {
          cell.setAttribute(
            "data-label",
            isSpanningRow ? "" : headerLabels[columnIndex] ?? ""
          );
          cell.setAttribute("data-responsive-label", "");
        }

        columnIndex += Math.max(cell.colSpan, 1);
      }

      const labelledCells = cells.filter((cell) => (cell.getAttribute("data-label") ?? "").trim());
      labelledCells[0]?.setAttribute("data-mobile-primary", "");

      for (const cell of cells) {
        const value = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const numeric = value.length > 0 && /^[\d\s.,/%+–—-]+(?:[A-Z]{3})?$/.test(value);
        cell.toggleAttribute("data-mobile-numeric", numeric);
      }

      const actionCell = cells.at(-1);
      if (actionCell?.querySelector(INTERACTIVE)) {
        actionCell.setAttribute("data-mobile-actions", "");
      }

      if (section === table.tFoot) continue;
      markExpandable(row, cells);
    }
  }
}

/** Matches the max-width the collapse CSS uses. */
const MOBILE_QUERY = "(max-width: 639px)";

export function ResponsiveTables() {
  useEffect(() => {
    const enhanceAllTables = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(enhanceTable);
    };

    // This enhancer injects a disclosure <button> into cells React owns. Two
    // things kept that colliding with hydration:
    //
    // 1. A `setTimeout(..., 0)` macrotask still fires before a *streamed*
    //    Suspense boundary finishes hydrating, so the button landed in a <td>
    //    React had not reconciled yet — it then saw an extra child and threw
    //    "Hydration failed". (`suppressHydrationWarning` does not help: it
    //    covers attribute/text drift on one element, not an extra child.)
    //    Deferring to idle puts the sweep safely after hydration.
    //
    // 2. The disclosure is only meaningful under the mobile breakpoint — the
    //    click handler below already checks it — yet it was injected at every
    //    width, so desktop paid the hydration risk for a control it never uses.
    //    Enhance only while the query matches, and re-run when it starts to.
    // matchMedia is missing in jsdom and in very old browsers. Degrade to
    // "always enhance" rather than silently dropping the disclosure there.
    const mql =
      typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY) : null;
    const isMobile = () => (mql ? mql.matches : true);

    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const cancelScheduled = () => {
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      idleHandle = undefined;
      timeoutHandle = undefined;
    };
    const schedule = (fn: () => void) => {
      cancelScheduled();
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(() => fn(), { timeout: 300 });
      } else {
        timeoutHandle = setTimeout(fn, 200);
      }
    };

    // Same idea as `schedule`, but each mutation batch gets its own handle so a
    // burst of streamed chunks does not cancel one another's sweep.
    const mutationHandles = new Set<number>();
    const mutationTimers = new Set<ReturnType<typeof setTimeout>>();
    const deferMutationSweep = (fn: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        const h = window.requestIdleCallback(() => {
          mutationHandles.delete(h);
          fn();
        }, { timeout: 300 });
        mutationHandles.add(h);
      } else {
        const t = setTimeout(() => {
          mutationTimers.delete(t);
          fn();
        }, 200);
        mutationTimers.add(t);
      }
    };

    const sweepIfMobile = () => {
      if (!isMobile()) return;
      enhanceAllTables();
    };

    // Idle alone can still land mid-hydration on a slow phone, so anchor the
    // first sweep to `load` — by then every streamed Suspense chunk has
    // arrived and React has hydrated it. Later sweeps (breakpoint change,
    // mutations) are past hydration by definition and only need idle.
    const startInitialSweep = () => schedule(sweepIfMobile);
    if (document.readyState === "complete") {
      startInitialSweep();
    } else {
      window.addEventListener("load", startInitialSweep, { once: true });
    }

    const onBreakpointChange = () => schedule(sweepIfMobile);
    mql?.addEventListener("change", onBreakpointChange);

    const observer = new MutationObserver((mutations) => {
      // A streamed Suspense chunk lands in the DOM *before* React hydrates it,
      // and React hydrates on a scheduler callback — so `setTimeout(..., 0)`
      // could still run first and inject the disclosure into markup React was
      // about to reconcile. Go through the same idle deferral as the initial
      // sweep, which yields to the scheduler instead of racing it.
      deferMutationSweep(() => {
        if (!isMobile()) return;
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            const table = mutation.target.parentElement?.closest(TABLE_SELECTOR);
            if (table instanceof HTMLTableElement) enhanceTable(table);
            continue;
          }

          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof Element)) continue;

            if (node.matches(TABLE_SELECTOR)) {
              enhanceTable(node as HTMLTableElement);
            } else {
              enhanceAllTables(node);
            }

            const table = node.closest(TABLE_SELECTOR);
            if (table instanceof HTMLTableElement) enhanceTable(table);
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // One delegated listener beats per-row handlers: it survives re-renders and
    // never touches the DOM structure. Only meaningful under the mobile
    // breakpoint, where the collapse rules are active.
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!isMobile()) return;

      const row = target.closest<HTMLTableRowElement>("tr[data-mobile-collapsible]");
      if (!row) return;
      // Let the row's own controls (checkbox, action buttons, links) act instead.
      if (target.closest(INTERACTIVE)) return;

      setExpanded(row, !row.hasAttribute("data-mobile-expanded"));
    };
    // The row is the control now, so it needs keyboard activation too.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!isMobile()) return;
      const row = target.closest<HTMLTableRowElement>("tr[data-mobile-collapsible]");
      if (!row || target !== row) return;
      event.preventDefault();
      setExpanded(row, !row.hasAttribute("data-mobile-expanded"));
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelScheduled();
      if (typeof window.cancelIdleCallback === "function") {
        mutationHandles.forEach((h) => window.cancelIdleCallback(h));
      }
      mutationTimers.forEach((t) => clearTimeout(t));
      window.removeEventListener("load", startInitialSweep);
      mql?.removeEventListener("change", onBreakpointChange);
      observer.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
