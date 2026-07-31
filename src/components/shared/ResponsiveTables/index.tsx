"use client";

/* eslint-disable no-undef */

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

/**
 * Mark a row as expandable. This only ever sets an attribute — injecting an
 * element here would change the DOM structure React is about to hydrate and
 * produce a hydration mismatch, so the chevron is drawn by CSS (::after) and
 * the tap is handled by one delegated listener on the document.
 */
function markExpandable(row: HTMLTableRowElement, cellCount: number) {
  if (cellCount <= SUMMARY_CELL_COUNT + 1) return;
  if (row.hasAttribute("data-mobile-spanning-row")) return;
  row.setAttribute("data-mobile-collapsible", "");
}

/** Elements whose own click must win over expand/collapse. */
const INTERACTIVE = "button,a,input,select,textarea,label,[role=checkbox],[role=button],[role=menuitem]";

function enhanceTable(table: HTMLTableElement) {
  table.classList.add("responsive-card-table");

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

      if (section === table.tFoot) continue;
      markExpandable(row, cells.length);
    }
  }
}

export function ResponsiveTables() {
  useEffect(() => {
    const enhanceAllTables = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(enhanceTable);
    };

    // This effect belongs to the root layout, so it runs before nested Suspense
    // children finish hydrating. Enhancing straight away rewrites attributes on
    // markup React is still reconciling, which it reports as a hydration
    // mismatch. A macrotask lets those boundaries settle first; the observer
    // below still catches anything that streams in afterwards.
    const initialSweep = setTimeout(enhanceAllTables, 0);

    const observer = new MutationObserver((mutations) => {
      // ponytail: setTimeout defers past React's synchronous hydration of
      // just-streamed Suspense chunks; mutating in the same tick corrupts
      // markup React hasn't hydrated yet, causing hydration mismatches.
      setTimeout(() => {
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
      }, 0);
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
      if (!window.matchMedia("(max-width: 639px)").matches) return;

      const row = target.closest<HTMLTableRowElement>("tr[data-mobile-collapsible]");
      if (!row) return;
      // Let the row's own controls (checkbox, action buttons, links) act instead.
      if (target.closest(INTERACTIVE)) return;

      row.toggleAttribute("data-mobile-expanded");
    };
    document.addEventListener("click", onClick);

    return () => {
      clearTimeout(initialSweep);
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
