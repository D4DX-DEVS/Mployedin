"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

interface OverlapMember {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  via: "city" | "state";
}

interface TerritoryOverlapNoticeProps {
  role: "super_agent" | "agent";
  cityIds: string[];
  stateIds: string[];
  /** User id of the profile being edited, so it is not listed against itself. */
  excludeUserId?: string | null;
}

/**
 * Tells an admin who else already covers the region being assigned.
 *
 * Shared regions are allowed — everyone covering a region sees the employers
 * registered in it — so this informs and never blocks the save.
 */
export function TerritoryOverlapNotice({ role, cityIds, stateIds, excludeUserId }: TerritoryOverlapNoticeProps) {
  const t = useTranslations("territoryOverlap");
  const [overlaps, setOverlaps] = useState<OverlapMember[]>([]);

  const cityKey = cityIds.join(",");
  const stateKey = stateIds.join(",");

  useEffect(() => {
    if (!cityKey && !stateKey) {
      setOverlaps([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ role, cityIds: cityKey, stateIds: stateKey });
      if (excludeUserId) params.set("exclude", excludeUserId);
      fetch(`/api/admin/territory-overlaps?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { overlaps: [] }))
        .then((data: { overlaps?: OverlapMember[] }) => setOverlaps(data.overlaps ?? []))
        .catch(() => { /* aborted — a newer selection is loading */ });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [role, cityKey, stateKey, excludeUserId]);

  if (overlaps.length === 0) return null;

  return (
    <div role="status" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {t(role === "super_agent" ? "superAgentTitle" : "agentTitle", { count: overlaps.length })}
        </p>
        <ul className="space-y-0.5">
          {overlaps.map((m) => (
            <li key={m.profileId} className="min-w-0 break-words">
              {m.name || m.email}
              <span className="text-amber-800/80"> · {t(m.via === "city" ? "viaCity" : "viaState")}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-amber-800/80">{t("body")}</p>
      </div>
    </div>
  );
}
