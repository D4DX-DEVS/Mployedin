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

function getDisclosureLabel(table: HTMLTableElement) {
  const language = table.closest<HTMLElement>("[lang]")?.lang || document.documentElement.lang;
  const fallback = language.startsWith("ar") ? "إظهار التفاصيل" : "Show details";
  return table.getAttribute("data-mobile-expand-label") || fallback;
}

const DISCLOSURE_SELECTOR = ":scope > td > button[data-mobile-disclosure], :scope > th > button[data-mobile-disclosure]";

function getDisclosure(row: HTMLTableRowElement) {
  return row.querySelector<HTMLButtonElement>(DISCLOSURE_SELECTOR);
}

function setExpanded(row: HTMLTableRowElement, expanded: boolean) {
  row.toggleAttribute("data-mobile-expanded", expanded);
  getDisclosure(row)?.setAttribute("aria-expanded", String(expanded));
}

/**
 * React stamps a `__reactFiber$…` key on every DOM node it has hydrated (or
 * rendered). A row without one, sitting under an ancestor that has one, is
 * server markup inside a Suspense boundary React has not hydrated yet — adding
 * a child there makes React throw "Hydration failed" over the extra node.
 */
function hasReactFiber(node: Node) {
  return Object.keys(node).some((key) => key.startsWith("__reactFiber$"));
}

function isAwaitingHydration(row: HTMLTableRowElement) {
  if (hasReactFiber(row)) return false;
  for (let node = row.parentNode; node; node = node.parentNode) {
    if (hasReactFiber(node)) return true;
  }
  return false;
}

/**
 * Give a long row a real disclosure <button> in one of its visible summary
 * cells. `aria-expanded` is not valid on a plain table row (only on treegrid
 * rows), so the state has to live on a control that owns it; the native button
 * also brings Enter/Space activation and focus for free. The row itself stays
 * a pointer target for convenience, but it is no longer focusable or announced
 * as a control.
 *
 * Returns false when the row is still awaiting hydration, so the caller can
 * retry once React has caught up. `force` skips that check — used after the
 * retries run out, for markup React will never hydrate (dangerouslySetInnerHTML).
 */
function markExpandable(
  row: HTMLTableRowElement,
  cells: HTMLTableCellElement[],
  force: boolean
) {
  const cellCount = cells.length;
  if (cellCount <= SUMMARY_CELL_COUNT + 1) return true;
  if (row.hasAttribute("data-mobile-spanning-row")) return true;

  const table = row.closest("table");
  if (!table) return true;

  if (getDisclosure(row)) {
    row.setAttribute("data-mobile-collapsible", "");
    return true;
  }
  if (!force && isAwaitingHydration(row)) return false;

  if (!table.id) {
    responsiveTableId += 1;
    table.id = `responsive-table-${responsiveTableId}`;
  }

  const detailIds = cells.slice(SUMMARY_CELL_COUNT).map((cell, index) => {
    if (!cell.id) cell.id = `${table.id}-row-${row.rowIndex}-detail-${index + 1}`;
    return cell.id;
  });

  // A summary cell stays visible while collapsed. Skip the selection-checkbox
  // cell: on phones it is pulled out of flow into the card's corner.
  const summaryCells = cells.slice(0, SUMMARY_CELL_COUNT);
  const host =
    summaryCells.find((cell) => !cell.querySelector("[role=checkbox]")) ?? summaryCells[0];
  const primary = cells.find((cell) => cell.hasAttribute("data-mobile-primary"));
  if (primary && !primary.id) primary.id = `${table.id}-row-${row.rowIndex}-primary`;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-mobile-disclosure", "");
  button.setAttribute("aria-label", getDisclosureLabel(table));
  button.setAttribute("aria-controls", detailIds.join(" "));
  // "Show details" alone is ambiguous in a list of rows; tie it to the record.
  if (primary) button.setAttribute("aria-describedby", primary.id);
  host.appendChild(button);

  row.setAttribute("data-mobile-collapsible", "");
  setExpanded(row, row.hasAttribute("data-mobile-expanded"));
  return true;
}

/** Elements whose own click must win over expand/collapse. */
const INTERACTIVE = "button,a,input,select,textarea,label,[role=checkbox],[role=button],[role=menuitem]";

function enhanceTable(table: HTMLTableElement, force = false) {
  let complete = true;
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
      if (!markExpandable(row, cells, force)) complete = false;
    }
  }

  return complete;
}

/** Matches the max-width the collapse CSS uses. */
const MOBILE_QUERY = "(max-width: 639px)";
/** ~5s of retries for rows awaiting hydration before injecting regardless. */
const HYDRATION_RETRY_MS = 250;
const MAX_HYDRATION_RETRIES = 20;

export function ResponsiveTables() {
  useEffect(() => {
    // Tables with rows React has not hydrated yet get swept again later; see
    // `isAwaitingHydration`. Hydration itself mutates nothing in the DOM, so
    // the MutationObserver below would never bring us back to them.
    const awaitingHydration = new Map<HTMLTableElement, number>();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const enhance = (table: HTMLTableElement) => {
      const attempts = awaitingHydration.get(table) ?? 0;
      const complete = enhanceTable(table, attempts >= MAX_HYDRATION_RETRIES);
      if (complete) {
        awaitingHydration.delete(table);
        return;
      }
      awaitingHydration.set(table, attempts + 1);
      if (retryTimer === undefined) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (!isMobile()) return;
          awaitingHydration.forEach((_, pending) => {
            if (pending.isConnected) enhance(pending);
            else awaitingHydration.delete(pending);
          });
        }, HYDRATION_RETRY_MS);
      }
    };

    const enhanceAllTables = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(enhance);
    };

    // This enhancer injects a disclosure <button> into cells React owns. Three
    // things keep that from colliding with hydration:
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
    //
    // 3. Even idle can land before a slow streamed boundary hydrates, so rows
    //    React has not claimed yet are skipped and retried (`enhance` above).
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
            if (table instanceof HTMLTableElement) enhance(table);
            continue;
          }

          for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof Element)) continue;

            if (node.matches(TABLE_SELECTOR)) {
              enhance(node as HTMLTableElement);
            } else {
              enhanceAllTables(node);
            }

            const table = node.closest(TABLE_SELECTOR);
            if (table instanceof HTMLTableElement) enhance(table);
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
    // breakpoint, where the collapse rules are active. Keyboard users reach the
    // disclosure <button>, whose native Enter/Space activation arrives here as
    // a click too.
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!isMobile()) return;

      const row = target.closest<HTMLTableRowElement>("tr[data-mobile-collapsible]");
      if (!row) return;
      // Let the row's own controls (checkbox, action buttons, links) act
      // instead — except the disclosure itself.
      const disclosure = target.closest("button[data-mobile-disclosure]");
      if (!disclosure && target.closest(INTERACTIVE)) return;

      setExpanded(row, !row.hasAttribute("data-mobile-expanded"));
    };

    document.addEventListener("click", onClick);

    return () => {
      cancelScheduled();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (typeof window.cancelIdleCallback === "function") {
        mutationHandles.forEach((h) => window.cancelIdleCallback(h));
      }
      mutationTimers.forEach((t) => clearTimeout(t));
      window.removeEventListener("load", startInitialSweep);
      mql?.removeEventListener("change", onBreakpointChange);
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
