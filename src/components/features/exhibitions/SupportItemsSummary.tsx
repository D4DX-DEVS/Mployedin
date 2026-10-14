"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { SupportItemType } from "@/lib/exhibitions/supportItems";

export interface SupportItemView {
  _id?: string;
  item: SupportItemType;
  label?: string;
  requestedQty: number;
  allocatedQty?: number;
  responsiblePerson?: string;
  allocationNote?: string;
  deliveryStatus?: string;
  deliveredQty?: number;
  deliveryNote?: string;
}

export const SUPPORT_ITEM_LABEL_KEYS: Record<SupportItemType, string> = {
  tv: "itemTv",
  rollup_banner: "itemRollupBanner",
  visiting_cards: "itemVisitingCards",
  volunteers: "itemVolunteers",
  other: "itemOther",
};

export const DELIVERY_STATUS_KEYS: Record<string, string> = {
  pending: "deliveryStatusPending",
  ready: "deliveryStatusReady",
  dispatched: "deliveryStatusDispatched",
  delivered: "deliveryStatusDelivered",
  issue: "deliveryStatusIssue",
};

export const DELIVERY_STATUS_TONES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-sky-100 text-sky-800",
  dispatched: "bg-indigo-100 text-indigo-800",
  delivered: "bg-emerald-100 text-emerald-800",
  issue: "bg-red-100 text-red-800",
};

/** "TV" | "Other: Projector screen". */
export function useSupportItemName() {
  const t = useTranslations("exhibitions");
  return (entry: Pick<SupportItemView, "item" | "label">) =>
    entry.item === "other" && entry.label ? `${t("itemOther")}: ${entry.label}` : t(SUPPORT_ITEM_LABEL_KEYS[entry.item]);
}

/**
 * Requested support as one line per item: "TV × 1", with the allocated and
 * delivered figures once an admin has recorded them. Read-only.
 */
export function SupportItemsSummary({ items }: { items: SupportItemView[] }) {
  const t = useTranslations("exhibitions");
  const nameOf = useSupportItemName();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("noSupportItems")}</p>;
  return (
    <ul className="grid gap-1.5 text-sm">
      {items.map((entry) => (
        <li key={entry._id ?? entry.item} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{nameOf(entry)}</span>
          <span className="text-muted-foreground">{t("supportRequestedQty", { count: entry.requestedQty })}</span>
          {entry.allocatedQty != null && (
            <span className="text-muted-foreground">· {t("supportAllocatedQty", { count: entry.allocatedQty })}</span>
          )}
          {entry.deliveryStatus && entry.deliveryStatus !== "pending" && (
            <Badge variant="outline" className={`border-0 text-[11px] ${DELIVERY_STATUS_TONES[entry.deliveryStatus] ?? ""}`}>
              {t(DELIVERY_STATUS_KEYS[entry.deliveryStatus] ?? "deliveryStatusPending")}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Chip text: the custom label for "Other", otherwise the item name. */
function useSupportChipName() {
  const t = useTranslations("exhibitions");
  return (entry: Pick<SupportItemView, "item" | "label">) =>
    entry.item === "other" ? entry.label || t("itemOther") : t(SUPPORT_ITEM_CHIP_KEYS[entry.item]);
}

const SUPPORT_ITEM_CHIP_KEYS: Record<SupportItemType, string> = {
  ...SUPPORT_ITEM_LABEL_KEYS,
  volunteers: "itemVolunteersShort",
};

/**
 * What the agent asked for, as chips under a queue row: "TV × 1", "Roll-up
 * flex/banner × 2", "+2 more". Requested quantities only — allocation and
 * delivery live in the detail view, never inferred from these.
 */
export function SupportItemChips({ items, max = 2 }: { items: SupportItemView[]; max?: number }) {
  const t = useTranslations("exhibitions");
  const chipName = useSupportChipName();
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const hidden = items.length - shown.length;
  const all = items.map((entry) => t("supportChip", { name: chipName(entry), count: entry.requestedQty })).join(", ");
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-1" aria-label={t("requestedSupport")} title={all}>
      {shown.map((entry, index) => (
        <li
          key={entry._id ?? `${entry.item}-${index}`}
          className="max-w-[11rem] truncate rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-sky-800"
        >
          {t("supportChip", { name: chipName(entry), count: entry.requestedQty })}
        </li>
      ))}
      {hidden > 0 && (
        <li className="rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
          {t("supportChipMore", { count: hidden })}
        </li>
      )}
    </ul>
  );
}

/**
 * Read-only requested / allocated / delivered table. A dash means the admin has
 * not recorded that figure yet — it is never filled in from the requested quantity.
 */
export function SupportItemsTable({ items }: { items: SupportItemView[] }) {
  const t = useTranslations("exhibitions");
  const nameOf = useSupportItemName();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("noSupportItems")}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start font-semibold">{t("supportItemColumn")}</th>
            <th className="px-2 py-2 text-end font-semibold">{t("requestedColumn")}</th>
            <th className="px-2 py-2 text-end font-semibold">{t("allocated")}</th>
            <th className="px-2 py-2 text-end font-semibold">{t("delivered")}</th>
            <th className="px-3 py-2 text-start font-semibold">{t("deliveryStatus")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {items.map((entry, index) => (
            <tr key={entry._id ?? index} className="align-top">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{nameOf(entry)}</p>
                {entry.responsiblePerson && (
                  <p className="text-xs text-muted-foreground">{t("responsibleShort", { name: entry.responsiblePerson })}</p>
                )}
                {entry.deliveryNote && <p className="text-xs text-muted-foreground">{entry.deliveryNote}</p>}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">{entry.requestedQty}</td>
              <td className="px-2 py-2 text-end tabular-nums">{entry.allocatedQty ?? "—"}</td>
              <td className="px-2 py-2 text-end tabular-nums">{entry.deliveredQty ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge className={`whitespace-nowrap border-0 rounded-md text-[11px] ${DELIVERY_STATUS_TONES[entry.deliveryStatus ?? "pending"] ?? ""}`}>
                  {t(DELIVERY_STATUS_KEYS[entry.deliveryStatus ?? "pending"] ?? "deliveryStatusPending")}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
