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
  const disclosure = row.querySelector<HTMLButtonElement>("button[data-mobile-disclosure]");
  if (!disclosure) return;

  disclosure.setAttribute("aria-expanded", String(expanded));
  const labels = getDisclosureLabels(row.closest("table") as HTMLTableElement);
  disclosure.setAttribute("aria-label", expanded ? labels.collapse : labels.expand);
}

/** Add the disclosure only after hydration has settled (see the deferred sweep
 * below), keeping server markup stable while exposing the CSS card affordance
 * as a real keyboard and screen-reader control. */
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

  let disclosure = row.querySelector<HTMLButtonElement>("button[data-mobile-disclosure]");
  if (!disclosure) {
    disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.setAttribute("data-mobile-disclosure", "");
    disclosure.className = "absolute end-0 top-0 z-10 h-11 w-11 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = getDisclosureLabels(table).expand;
    disclosure.append(label);
    cells[Math.min(SUMMARY_CELL_COUNT - 1, cells.length - 1)].append(disclosure);
  }

  disclosure.setAttribute("aria-controls", detailIds.join(" "));
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

      const disclosure = target.closest<HTMLButtonElement>("button[data-mobile-disclosure]");
      const row = target.closest<HTMLTableRowElement>("tr[data-mobile-collapsible]");
      if (!row) return;
      if (disclosure) {
        setExpanded(row, !row.hasAttribute("data-mobile-expanded"));
        return;
      }
      // Let the row's own controls (checkbox, action buttons, links) act instead.
      if (target.closest(INTERACTIVE)) return;

      setExpanded(row, !row.hasAttribute("data-mobile-expanded"));
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
