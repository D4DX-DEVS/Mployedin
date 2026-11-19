"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PageSelectionState = "none" | "some" | "all";

/**
 * Row checkboxes for a paged list. The ticked rows are kept whole, not just
 * their ids: an export names them and builds its sheet from them after the page
 * has changed. Insertion order is the order they were ticked; select-all on a
 * page adds that page's rows in page order.
 *
 * `idOf` may be an inline function; the callbacks stay stable regardless.
 */
export function useRowSelection<T>(idOf: (row: T) => string) {
  const [selected, setSelected] = useState<ReadonlyMap<string, T>>(() => new Map());
  const idOfRef = useRef(idOf);
  // Updated after commit, not during render; handlers only read it after that.
  useEffect(() => {
    idOfRef.current = idOf;
  });

  const toggle = useCallback((row: T) => {
    const id = idOfRef.current(row);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, row);
      return next;
    });
  }, []);

  /** Every row of the page selected, or, when they all already are, none of them (rows from other pages stay). */
  const togglePage = useCallback((page: readonly T[]) => {
    setSelected((current) => {
      const ids = page.map((row) => idOfRef.current(row));
      const allSelected = ids.length > 0 && ids.every((id) => current.has(id));
      const next = new Map(current);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        page.forEach((row, i) => { if (!next.has(ids[i])) next.set(ids[i], row); });
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const pageState = useCallback(
    (page: readonly T[]): PageSelectionState => {
      if (page.length === 0) return "none";
      const count = page.reduce((n, row) => n + (selected.has(idOfRef.current(row)) ? 1 : 0), 0);
      return count === 0 ? "none" : count === page.length ? "all" : "some";
    },
    [selected],
  );

  const items = useMemo(() => Array.from(selected.values()), [selected]);

  return { items, count: selected.size, isSelected, toggle, togglePage, pageState, clear };
}
