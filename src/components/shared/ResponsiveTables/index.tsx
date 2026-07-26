"use client";

/* eslint-disable no-undef */

import { useEffect } from "react";

const TABLE_SELECTOR = "table:not([data-mobile-table='scroll'])";
const ENHANCE_DELAY_MS = 160;

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
        const isLastCell = cell === cells[cells.length - 1];
        const hasRowActions =
          isLastCell &&
          !isSpanningRow &&
          cell.querySelector("button, a[href], [role='button']") !== null;

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

        cell.toggleAttribute("data-mobile-actions", hasRowActions);
        columnIndex += Math.max(cell.colSpan, 1);
      }
    }
  }
}

export function ResponsiveTables() {
  useEffect(() => {
    const pendingTables = new Set<HTMLTableElement>();
    let enhanceTimer: ReturnType<typeof setTimeout> | null = null;

    const collectTables = (root: ParentNode = document) => {
      if (root instanceof HTMLTableElement && root.matches(TABLE_SELECTOR)) {
        pendingTables.add(root);
      }
      root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach((table) => {
        pendingTables.add(table);
      });
    };

    const scheduleEnhancement = (root: ParentNode = document) => {
      collectTables(root);
      if (enhanceTimer) clearTimeout(enhanceTimer);

      // Dashboard pages can stream inside a hydrated provider. Mutating a newly
      // streamed table immediately makes React see extra classes/attributes
      // during hydration. A short settled-DOM batch keeps the enhancement
      // progressive without producing hydration mismatches.
      enhanceTimer = setTimeout(() => {
        pendingTables.forEach((table) => {
          if (table.isConnected) enhanceTable(table);
        });
        pendingTables.clear();
        enhanceTimer = null;
      }, ENHANCE_DELAY_MS);
    };

    scheduleEnhancement();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const table = mutation.target.parentElement?.closest(TABLE_SELECTOR);
          if (table instanceof HTMLTableElement) scheduleEnhancement(table);
          continue;
        }

        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;

          scheduleEnhancement(node);
          const parentTable = node.closest(TABLE_SELECTOR);
          if (parentTable instanceof HTMLTableElement) scheduleEnhancement(parentTable);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (enhanceTimer) clearTimeout(enhanceTimer);
      pendingTables.clear();
    };
  }, []);

  return null;
}
