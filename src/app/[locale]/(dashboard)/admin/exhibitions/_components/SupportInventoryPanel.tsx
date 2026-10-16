"use client";

import { useTranslations } from "next-intl";
import { PackageCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAllocationSummary, getDeliverySummary, type SupportItem } from "@/lib/exhibitions/supportItems";
import { SupportItemsTable } from "@/components/features/exhibitions/SupportItemsSummary";
import type { ExhibitionRequest } from "../_lib/exhibitions";
import type { SupportDialogMode } from "./SupportManageDialog";
// The support route enforces the same stages.
import { SUPPORT_ALLOCATE_STATUSES, SUPPORT_DELIVERY_STATUSES } from "@/lib/exhibitions/transitions";

const ALLOCATION_TONES = {
  none: "bg-amber-100 text-amber-800",
  partial: "bg-orange-100 text-orange-800",
  full: "bg-emerald-100 text-emerald-800",
} as const;

const ALLOCATION_KEYS = {
  none: "allocationStatusNone",
  partial: "allocationStatusPartial",
  full: "allocationStatusFull",
} as const;

/**
 * The inspector's "Support & inventory" block: what the agent asked for,
 * what was allocated (and who is responsible), and where delivery stands,
 * with the actions the request's stage allows.
 */
export function SupportInventoryPanel({
  item,
  onManage,
}: {
  item: ExhibitionRequest;
  onManage: (mode: SupportDialogMode) => void;
}) {
  const t = useTranslations("exhibitions");
  const items = item.supportItems ?? [];
  const allocation = getAllocationSummary(items as SupportItem[]);
  const delivery = getDeliverySummary(items as SupportItem[]);
  const canAllocate = items.length > 0 && SUPPORT_ALLOCATE_STATUSES.includes(item.status);
  const canDeliver = items.length > 0 && SUPPORT_DELIVERY_STATUSES.includes(item.status);

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`border-0 rounded-md text-[11px] font-semibold ${ALLOCATION_TONES[allocation.status]}`}>
              {t(ALLOCATION_KEYS[allocation.status])}
            </Badge>
            {allocation.status !== "none" && allocation.shortage > 0 && (
              <span className="text-xs text-orange-700">{t("shortage", { count: allocation.shortage })}</span>
            )}
            {delivery.hasIssues && (
              <Badge className="border-0 rounded-md bg-red-100 text-[11px] font-semibold text-red-800">{t("deliveryHasIssue")}</Badge>
            )}
          </div>

          <SupportItemsTable items={items} />
        </>
      )}

      {item.additionalRequirements && (
        <div className="rounded-xl border border-border/60 bg-muted/10 chip-pad">
          <p className="text-xs font-semibold text-muted-foreground">{t("additionalRequirements")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.additionalRequirements}</p>
        </div>
      )}

      {(canAllocate || canDeliver) && (
        <div className="flex flex-wrap gap-2">
          {canAllocate && (
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => onManage("allocate")}>
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              {t("allocateResources")}
            </Button>
          )}
          {canDeliver && (
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => onManage("delivery")}>
              <Truck className="h-4 w-4" aria-hidden="true" />
              {t("updateDelivery")}
            </Button>
          )}
        </div>
      )}
      {items.length > 0 && !canAllocate && !canDeliver && (
        <p className="text-xs text-muted-foreground">{t("supportLockedHint")}</p>
      )}
    </div>
  );
}
