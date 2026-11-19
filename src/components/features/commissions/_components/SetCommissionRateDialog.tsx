"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export interface CommissionRateHistory {
  rate: number;
  effectiveFrom: Date | string;
  setByRole?: "admin" | "super_agent";
  reason?: string;
  setAt?: Date | string;
}

export interface SetCommissionRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employerId: string;
  currentRate: number | null;
  history: CommissionRateHistory[];
  onRateSet: (rate: number, effectiveFrom: string, reason: string) => Promise<void>;
  adminOverridden?: boolean;
  endpoint: "admin" | "super_agent" | "agent";
}

export function SetCommissionRateDialog({
  open,
  onOpenChange,
  employerId: _employerId,
  currentRate,
  history,
  onRateSet,
  adminOverridden,
  endpoint,
}: SetCommissionRateDialogProps) {
  const t = useTranslations("commissionRates");
  const [rate, setRate] = useState<string>(currentRate?.toString() ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      setError(t("errorInvalidRate"));
      return;
    }

    if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError(t("errorInvalidDate"));
      return;
    }

    if (reason.length > 500) {
      setError(t("errorInvalidReason"));
      return;
    }

    setLoading(true);
    try {
      await onRateSet(rateNum, effectiveFrom, reason);
      toast.success(t("toastRateSet"));
      onOpenChange(false);
      setRate("");
      setEffectiveFrom("");
      setReason("");
    } catch {
      const message = t("toastRateFailed");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (endpoint === "agent") {
    return null; // Agents cannot edit rates
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("setRateTitle")}</DialogTitle>
          <DialogDescription>
            {currentRate !== null
              ? `${t("currentRateLabel")}: ${currentRate}%`
              : t("noRateSet")}
          </DialogDescription>
        </DialogHeader>

        {adminOverridden && endpoint === "super_agent" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            {t("adminOverriddenWarning")}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/40 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("historySectionTitle")}
            </p>
            <div className="space-y-1">
              {history.slice(0, 3).map((entry, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  <span className="font-medium">{entry.rate}%</span> from{" "}
                  {new Date(entry.effectiveFrom).toLocaleDateString()}
                  {entry.setByRole && (
                    <>
                      {" "}
                      <span className="text-[10px]">
                        (
                        {entry.setByRole === "admin"
                          ? t("adminSetBadge")
                          : t("superAgentSetBadge")}
                        )
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="rate">{t("rateLabel")}</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                id="rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0"
                disabled={loading || adminOverridden}
                required
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <div>
            <Label htmlFor="effectiveFrom">{t("effectiveFromLabel")}</Label>
            <Input
              id="effectiveFrom"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={loading || adminOverridden}
              required
              className="mt-1.5"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("effectiveFromHint")}
            </p>
          </div>

          <div>
            <Label htmlFor="reason">{t("reasonLabel")}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              disabled={loading || adminOverridden}
              className="mt-1.5"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={loading || adminOverridden}
              className="flex-1"
            >
              {loading ? t("setButton") : t("setButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              {t("cancelButton")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
