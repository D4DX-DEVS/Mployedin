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
    }
  }
}

export function ResponsiveTables() {
  useEffect(() => {
    const enhanceAllTables = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(enhanceTable);
    };

    enhanceAllTables();

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

    return () => observer.disconnect();
  }, []);

  return null;
}
