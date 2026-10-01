"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

export type EmployerView = "cards" | "table";

const STORAGE_KEY = "agent-employers-view";
const isView = (value: unknown): value is EmployerView => value === "cards" || value === "table";

/**
 * Cards or table for the agent's employer list.
 *
 * `?view=` wins so a shared link opens the same layout; without it the agent's
 * last pick is used. The pick is a per-browser convenience, so storage may be
 * missing (private window, blocked site data) and the list still renders as
 * cards. Switching uses `router.replace` and keeps `?page=` — changing the
 * layout is not a new filter and must not jump back to page 1.
 */
export function useEmployerView(): [EmployerView, (next: EmployerView) => void] {
  const router = useRouter();
  const param = useSearchParams().get("view");
  // Read after mount: the page is server-rendered, where storage does not exist.
  const [remembered, setRemembered] = useState<EmployerView | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isView(stored)) setRemembered(stored);
    } catch {
      // Storage blocked — fall back to cards.
    }
  }, []);

  const setView = useCallback(
    (next: EmployerView) => {
      setRemembered(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage blocked — the URL still carries the choice.
      }
      const params = readQuery();
      params.set("view", next);
      writeQuery(params, (href) => router.replace(href, { scroll: false }));
    },
    [router],
  );

  return [isView(param) ? param : remembered ?? "cards", setView];
}
