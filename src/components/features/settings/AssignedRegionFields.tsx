"use client";

import { MapPin, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { AssignedRegion } from "@/lib/agents/assignedRegion";

export interface SupervisingSuperAgent {
  name: string;
  email: string;
}

interface AssignedRegionFieldsProps {
  regions: readonly AssignedRegion[];
  /** Agents only: the super-agent they report to. Omit on the super-agent's own profile. */
  superAgent?: SupervisingSuperAgent | null;
  showSuperAgent?: boolean;
}

/**
 * Read-only profile rows for what an admin set on this account: the assigned
 * region(s) and, for an agent, the super-agent above them. Same shape as the
 * read-only email row beside it — the user can see it, not change it.
 */
export function AssignedRegionFields({ regions, superAgent = null, showSuperAgent = false }: AssignedRegionFieldsProps) {
  const t = useTranslations("assignedRegion");

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2" data-testid="assigned-region-field">
        <p className="text-sm font-medium text-foreground">{t("profileTitle")}</p>
        <div className="flex min-h-10 items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {regions.length > 0 ? (
            <ul className="min-w-0 flex-1 space-y-0.5">
              {regions.map((region) => (
                <li key={region.id} className="text-sm text-foreground">
                  <span className="font-medium">{region.name}</span>
                  {region.parent && <span className="text-muted-foreground">, {region.parent}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <span className="min-w-0 flex-1 text-sm text-amber-800">{t("none")}</span>
          )}
          <Badge variant="outline" className="ms-auto shrink-0 text-[11px]">{t("readOnly")}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">{regions.length > 0 ? t("profileHelp") : t("noneHint")}</p>
      </div>

      {showSuperAgent && (
        <div className="space-y-2" data-testid="assigned-super-agent-field">
          <p className="text-sm font-medium text-foreground">{t("superAgent")}</p>
          <div className="flex min-h-10 items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {superAgent ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{superAgent.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{superAgent.email}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">{t("superAgentNone")}</span>
            )}
            <Badge variant="outline" className="ms-auto shrink-0 text-[11px]">{t("readOnly")}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("superAgentHelp")}</p>
        </div>
      )}
    </div>
  );
}
