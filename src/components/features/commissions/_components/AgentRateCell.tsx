"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Percent } from "lucide-react";
import { useCommissionRate } from "@/hooks/useCommissionRate";
import { SetCommissionRateDialog, type CommissionRateHistory } from "@/components/features/commissions/_components/SetCommissionRateDialog";
import { toast } from "sonner";

interface AgentRateCellProps {
  employerId: string;
  initialRate?: number | null;
  onRateChanged?: (rate: number | null) => void;
  role?: "admin" | "super_agent" | "agent";
  lockedByAdmin?: boolean;
}

export function AgentRateCell({
  employerId,
  initialRate,
  onRateChanged,
  role = "admin",
  lockedByAdmin = false
}: AgentRateCellProps) {
  const t = useTranslations("commissionRates");
  const { fetchRate, setRate } = useCommissionRate(role);
  const [rate, setRateLocal] = useState<number | null>(initialRate ?? null);
  const [history, setHistory] = useState<CommissionRateHistory[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOpenDialog = async () => {
    setLoading(true);
    try {
      const data = await fetchRate(employerId);
      setHistory(data.history);
      if (data.current.rate !== undefined) {
        setRateLocal(data.current.rate);
      }
      setDialogOpen(true);
    } catch {
      toast.error(t("toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSetRate = async (newRate: number, effectiveFrom: string, reason: string) => {
    try {
      await setRate(employerId, newRate, effectiveFrom, reason);
      setRateLocal(newRate);
      onRateChanged?.(newRate);
      setDialogOpen(false);
    } catch {
      const message = t("toastRateFailed");
      throw new Error(message);
    }
  };

  if (rate === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (role === "agent") {
    // A <span> with the badge look, not <Badge> (a <div>): the agent's phone
    // card puts this inside a <p>, where a <div> is a hydration error (audit
    // 2026-11-26 AG-09).
    return (
      <span className={cn(badgeVariants({ variant: "secondary" }), "gap-1 rounded-full")}>
        <Percent className="h-3 w-3" aria-hidden="true" />
        {rate}%
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1 rounded-full">
          <Percent className="h-3 w-3" />
          {rate}%
        </Badge>
        {lockedByAdmin ? (
          <Badge variant="outline" className="text-xs">Set by admin</Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenDialog}
            disabled={loading}
            className="text-xs"
          >
            {rate !== null ? "Change" : "Set rate"}
          </Button>
        )}
      </div>

      {!lockedByAdmin && (
        <SetCommissionRateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          employerId={employerId}
          currentRate={rate}
          history={history}
          onRateSet={handleSetRate}
          endpoint={role}
          adminOverridden={lockedByAdmin}
        />
      )}
    </>
  );
}
