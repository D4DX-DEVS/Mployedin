import { useEffect, useRef } from "react";

/** Fired on window after a confirmed Copilot action ran; `detail.tool` names it. */
export const COPILOT_EXECUTED_EVENT = "mployedin:copilot-executed";

/**
 * Calls `onExecuted` when the Copilot runs one of `tools` — so a page refreshes
 * the rows a confirmed action changed instead of showing them stale until a reload.
 */
export function useCopilotExecuted(tools: readonly string[], onExecuted: () => void): void {
  const latest = useRef(onExecuted);
  latest.current = onExecuted;
  const key = tools.join(",");
  useEffect(() => {
    const names = new Set(key.split(","));
    const handler = (e: Event) => {
      const tool = (e as CustomEvent<{ tool?: string }>).detail?.tool;
      if (tool && names.has(tool)) latest.current();
    };
    window.addEventListener(COPILOT_EXECUTED_EVENT, handler);
    return () => window.removeEventListener(COPILOT_EXECUTED_EVENT, handler);
  }, [key]);
}
