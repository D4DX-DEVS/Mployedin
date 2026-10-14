"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { KNOWN_ERROR_CODES, type CheckDetailPayload } from "./checkDetailTypes";

/**
 * Loads one check and sends actions for it. `apiBase` picks the side:
 * /api/employer/background-checks for the employer's team,
 * /api/background-checks for agents. Both answer with the same payload.
 */
export function useCheckDetail(apiBase: string, checkId: string | null, onChanged?: () => void) {
  const t = useTranslations("backgroundCheckWork");
  const [data, setData] = useState<CheckDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!checkId) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`${apiBase}/${checkId}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as CheckDetailPayload);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [apiBase, checkId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  /** Sends one action; answers true when the server accepted it. `key` marks which control is busy. */
  const act = useCallback(
    async (body: Record<string, unknown>, key: string = String(body.action)): Promise<boolean> => {
      if (!checkId) return false;
      setPending(key);
      try {
        const res = await csrfFetch(`${apiBase}/${checkId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await res.json().catch(() => ({}))) as Partial<CheckDetailPayload> & { code?: string };
        if (!res.ok) {
          const code = (KNOWN_ERROR_CODES as readonly string[]).includes(payload.code ?? "") ? payload.code : null;
          toast.error(code ? t(`errors.${code}`) : t("errors.generic"));
          // The check may have moved on (claimed, closed); show where it stands now.
          if (res.status === 409) void load();
          return false;
        }
        setData(payload as CheckDetailPayload);
        onChanged?.();
        return true;
      } catch {
        toast.error(t("errors.generic"));
        return false;
      } finally {
        setPending(null);
      }
    },
    [apiBase, checkId, load, onChanged, t]
  );

  return { data, loading, failed, pending, reload: load, act };
}
