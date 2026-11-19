"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { csrfFetch } from "@/lib/security/csrf-client";

interface AgentRow {
  userId: string;
  name: string;
  email: string;
  currency: string;
  target?: {
    jobTarget: number;
    conversionTarget: number;
    revenueTarget: number;
    setByRole: "admin" | "super_agent";
    overriddenByAdmin: boolean;
  };
  actuals?: {
    jobs: number;
    onboarded: number;
    revenue: number;
  };
}

interface AgentTargetRowProps {
  agent: AgentRow;
  year: number;
  canSetRevenueTargets: boolean;
  onUpdate: () => void;
}

interface KpiTargets {
  jobTarget: number;
  conversionTarget: number;
  revenueTarget: number;
}

export function AgentTargetRow({
  agent,
  year,
  canSetRevenueTargets,
  onUpdate,
}: AgentTargetRowProps) {
  const t = useTranslations("profitTargets");
  const [kpi, setKpi] = useState<KpiTargets>({
    jobTarget: agent.target?.jobTarget ?? 0,
    conversionTarget: agent.target?.conversionTarget ?? 0,
    revenueTarget: agent.target?.revenueTarget ?? 0,
  });
  const [saving, setSaving] = useState(false);
  // A saved target is shown as read-only figures until "Edit" is pressed.
  const [editing, setEditing] = useState(!agent.target);

  const isAdminSet = agent.target?.setByRole === "admin" || agent.target?.overriddenByAdmin;
  const isLocked = isAdminSet;

  const handleKpiChange = (field: keyof KpiTargets, value: number) => {
    setKpi((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await csrfFetch("/api/super-agent/target-profiles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigneeId: agent.userId,
          assigneeRole: "agent",
          year,
          currency: agent.currency,
          jobTarget: kpi.jobTarget,
          conversionTarget: kpi.conversionTarget,
          revenueTarget: kpi.revenueTarget,
          profitTarget: 0,
        }),
      });

      if (!res.ok) {
        // 403 = admin set this target or revenue isn't allowed; never show raw API text.
        toast.error(res.status === 403 ? t("setByAdmin") : t("actionFailed"));
        return;
      }

      toast.success(t("targetSaved"));
      setEditing(false);
      onUpdate();
    } catch {
      toast.error(t("actionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const perMonth = (field: keyof KpiTargets) => {
    const n = kpi[field] / 12;
    if (field === "revenueTarget") return formatCurrency(n, agent.currency);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };
  const done = (field: keyof KpiTargets) => {
    const a = agent.actuals;
    if (!a) return null;
    if (field === "jobTarget") return String(a.jobs);
    if (field === "conversionTarget") return String(a.onboarded);
    return formatCurrency(a.revenue, agent.currency);
  };

  /** One yearly figure. Revenue shows the agent's currency inside the box; hints sit under it. */
  const cancelEdit = () => {
    setKpi({
      jobTarget: agent.target?.jobTarget ?? 0,
      conversionTarget: agent.target?.conversionTarget ?? 0,
      revenueTarget: agent.target?.revenueTarget ?? 0,
    });
    setEditing(false);
  };

  const renderKpiInput = (field: keyof KpiTargets, label: string) => {
    const money = field === "revenueTarget";
    const doneText = done(field);
    const hints = (
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        {kpi[field] > 0 && t("perMonthHint", { value: perMonth(field) })}
        {kpi[field] > 0 && doneText && " · "}
        {doneText && t("doneSoFar", { value: doneText })}
      </p>
    );
    // Saved (or admin-set) and not being edited: plain figures, no input box.
    if (!editing || isLocked) {
      return (
        <div className="min-w-0 text-center">
          <p className="mb-1 text-xs font-medium text-muted-foreground sm:hidden">{label}</p>
          <p className="text-sm font-semibold tabular-nums">
            {money ? formatCurrency(kpi[field], agent.currency) : kpi[field]}
          </p>
          {hints}
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <Label htmlFor={`${field}-${agent.userId}`} className="mb-1 block text-xs font-medium text-muted-foreground sm:hidden">
          {label}
        </Label>
        <div className="relative">
          <Input
            id={`${field}-${agent.userId}`}
            type="number"
            aria-label={label}
            min={0}
            step={money ? "0.01" : "1"}
            inputMode={money ? "decimal" : "numeric"}
            value={kpi[field] || ""}
            onChange={(e) => handleKpiChange(field, Number(e.target.value) || 0)}
            placeholder="0"
            disabled={isLocked || (money && !canSetRevenueTargets) || saving}
            className={`h-9 w-full rounded-lg border-border bg-background text-center text-sm tabular-nums max-sm:h-11 ${money ? "pe-12" : ""}`}
          />
          {money && (
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[11px] font-medium text-muted-foreground">
              {agent.currency}
            </span>
          )}
        </div>
        {hints}
      </div>
    );
  };

  return (
    <tr className={`transition-colors max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-end max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-4 max-sm:py-3 ${isAdminSet ? "bg-sky-50/50" : "hover:bg-muted/20"}`}>
      <td className="px-4 py-3 max-sm:col-span-2 max-sm:block max-sm:p-0">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{agent.name}</p>
          <p className="break-all text-[11px] text-muted-foreground">{agent.email}</p>
          {isAdminSet ? (
            <Badge variant="outline" className="mt-1 px-2 py-0.5 text-[11px]">
              {t("setByAdmin")}
            </Badge>
          ) : agent.target && !editing ? (
            <Badge variant="outline" className="mt-1 border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
              {t("savedBadge")}
            </Badge>
          ) : null}
        </div>
      </td>

      <td className="px-4 py-3 max-sm:col-start-1 max-sm:row-start-2 max-sm:block max-sm:p-0">
        {renderKpiInput("jobTarget", t("jobsYearHeader"))}
      </td>

      <td className="px-4 py-3 max-sm:col-start-1 max-sm:row-start-3 max-sm:block max-sm:p-0">
        {renderKpiInput("conversionTarget", t("onboardedYearHeader"))}
      </td>

      <td className="px-4 py-3 max-sm:col-start-1 max-sm:row-start-4 max-sm:block max-sm:p-0">
        {!canSetRevenueTargets && !isAdminSet ? (
          <div className="text-center text-xs text-muted-foreground italic">
            {t("revenueNotAllowed")}
          </div>
        ) : (
          renderKpiInput("revenueTarget", t("revenueYearHeader"))
        )}
      </td>

      {/* Always drawn so the columns line up when an admin-set row has no Save. */}
      <td className="px-4 py-3 align-top max-sm:col-span-2 max-sm:block max-sm:p-0">
        {!isLocked && !editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            aria-label={t("editTargetFor", { name: agent.name })}
            className="max-sm:min-h-11 max-sm:w-full"
          >
            {t("editShort")}
          </Button>
        )}
        {!isLocked && editing && (
          <div className="flex flex-col gap-1.5 max-sm:flex-row">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              aria-label={t("saveTargetFor", { name: agent.name })}
              className="max-sm:min-h-11 max-sm:flex-1"
            >
              {saving ? t("saving") : t("save")}
            </Button>
            {agent.target && (
              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} disabled={saving} className="max-sm:min-h-11 max-sm:flex-1">
                {t("cancel")}
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
