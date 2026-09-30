"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

/**
 * Open a row's dialog from the address: `?open=<id>` calls `open(row)` once the
 * row is in `items`, then drops the param so a refresh or Back does not open it
 * again. Pair it with `?search=` so the row is on the first page.
 *
 * Used by User Management's "Assign…" actions (client report 2026-09-30).
 */
export function useOpenFromUrl<T extends { _id: string }>(
  items: readonly T[],
  open: (item: T) => void,
  key: string = "open",
): void {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = searchParams.get(key);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!target || handled.current === target) return;
    const item = items.find((row) => row._id === target);
    if (!item) return;
    handled.current = target;
    open(item);
    const params = readQuery();
    params.delete(key);
    writeQuery(params, (href) => router.replace(href, { scroll: false }));
  }, [items, target, key, open, router]);
}
