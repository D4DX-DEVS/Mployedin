"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuiltCvResponse } from "@/lib/cv/renderBuiltCv";

export type BuiltCvState =
  | { status: "loading" }
  | { status: "ready"; data: BuiltCvResponse }
  /** notFound: the candidate is gone or not the viewer's to open (404/403). error: anything else, a failure worth trying again. */
  | { status: "failed"; reason: "notFound" | "error" };

const LOADING: BuiltCvState = { status: "loading" };

/**
 * The details a candidate's standardised (Mployedin) CV is drawn from, fetched
 * once from `…/cv?kind=built`. The CV viewer reads one answer three ways: which
 * tabs are usable (`hasContent`), the preview, and the download. Fetching it
 * here, once, is what keeps those from asking separately.
 *
 * What comes back belongs to the `url` it was fetched for: after `url`
 * changes the old answer is never returned, not even for the one render before
 * the new fetch starts. `url` null means nothing to fetch (the state is then
 * meaningless and the caller ignores it). `retry` fetches again after a failure.
 */
export function useBuiltCv(url: string | null): { state: BuiltCvState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}|${url}`;
  const [result, setResult] = useState<{ key: string; state: BuiltCvState }>({ key, state: LOADING });

  useEffect(() => {
    if (!url) return;
    let live = true;
    const controller = new AbortController();
    const settle = (state: BuiltCvState) => { if (live) setResult({ key, state }); };
    setResult((current) => (current.key === key ? current : { key, state: LOADING }));
    fetch(url, { credentials: "same-origin", signal: controller.signal })
      .then((res) => {
        if (res.ok) return res.json().then((data: BuiltCvResponse) => settle({ status: "ready", data }));
        settle({ status: "failed", reason: res.status === 404 || res.status === 403 ? "notFound" : "error" });
      })
      .catch(() => settle({ status: "failed", reason: "error" }));
    return () => {
      live = false;
      controller.abort();
    };
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state: result.key === key ? result.state : LOADING, retry };
}
