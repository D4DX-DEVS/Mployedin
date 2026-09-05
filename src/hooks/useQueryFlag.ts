"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

/**
 * A dialog whose open state has an address.
 *
 * Creating something used to be possible only from the page that hosts the
 * button, so the global Create menu had nowhere to send anyone. Giving the
 * dialog a query flag — `?new=1` — lets a menu item, a shortcut or a link open
 * it directly, and lets the user share or reload that state.
 *
 * The initial read goes through `useSearchParams` so server and client agree on
 * the first render. The write goes through the shared query helper rather than
 * `history.replaceState`, because a filter write in the same tick has not
 * reached `window.location` yet and a raw replaceState built from the stale
 * string would wipe it. `page` is deliberately left alone: opening or closing a
 * dialog is not a filter change.
 */
export function useQueryFlag(
  key: string,
  openValue = "1",
): [boolean, (open: boolean) => void] {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpenState] = useState(() => searchParams?.get(key) === openValue);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      const params = readQuery();
      if (next) params.set(key, openValue);
      else params.delete(key);
      writeQuery(params, (href) => router.replace(href, { scroll: false }));
    },
    [key, openValue, router],
  );

  return [open, setOpen];
}
