/**
 * Support items and inventory allocation for exhibitions.
 * Supports: TV, Roll-up flex/banner, Visiting cards, Volunteers (staff/people), Other
 */

export type SupportItemType = "tv" | "rollup_banner" | "visiting_cards" | "volunteers" | "other";

export const SUPPORT_ITEM_TYPES: SupportItemType[] = [
  "tv",
  "rollup_banner",
  "visiting_cards",
  "volunteers",
  "other",
];

export type DeliveryStatus = "pending" | "ready" | "dispatched" | "delivered" | "issue";

/** English names for server messages (the UI names items through next-intl). */
const ITEM_NAMES: Record<SupportItemType, string> = {
  tv: "TV",
  rollup_banner: "Roll-up flex/banner",
  visiting_cards: "Visiting cards",
  volunteers: "Volunteers",
  other: "Other",
};

function itemName(type: SupportItemType): string {
  return ITEM_NAMES[type] ?? type;
}

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending",
  "ready",
  "dispatched",
  "delivered",
  "issue",
];

export interface SupportItem {
  _id?: string; // MongoDB ID if persisted
  item: SupportItemType;
  label?: string; // Required when item = "other", max 120 chars
  requestedQty: number; // min 1, max 100000
  allocatedQty?: number; // min 0, max requestedQty
  responsiblePerson?: string; // max 120 chars
  allocationNote?: string; // max 500 chars
  deliveryStatus: DeliveryStatus;
  deliveredQty?: number; // min 0, max allocatedQty
  deliveryNote?: string; // max 500 chars
  updatedAt?: Date;
  updatedBy?: string; // User ObjectId
}

export interface AllocationSummary {
  status: "none" | "partial" | "full";
  shortage: number; // requested - allocated for items with allocation < requested
  allocatedCount: number; // items with some allocation
  totalItems: number;
}

export interface DeliverySummary {
  allDelivered: boolean;
  pendingCount: number; // items not delivered
  hasIssues: boolean; // any with delivery status "issue"
}

/**
 * Validation for agent-submitted support items.
 * Agents can only set item, label, and requestedQty.
 * This rejects unknown items, invalid quantities, "other" without label, and duplicates.
 */
export function validateSupportItems(input: unknown): { ok: true; items: SupportItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Support items must be a list." };
  }

  const items: SupportItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < input.length; i++) {
    const item = (input as unknown[])[i];

    if (!item || typeof item !== "object") {
      return { ok: false, error: "One of the support items is incomplete." };
    }

    const obj = item as Record<string, unknown>;
    const type = obj.item;

    // Validate item type
    if (!type || !SUPPORT_ITEM_TYPES.includes(type as SupportItemType)) {
      return { ok: false, error: "Choose support items from the list (TV, roll-up banner, visiting cards, volunteers or other)." };
    }

    // Check for duplicates
    if (seen.has(type as string)) {
      return { ok: false, error: `${itemName(type as SupportItemType)} is listed twice — list each support item once.` };
    }
    seen.add(type as string);

    // Validate label for "other"
    if (type === "other") {
      const label = obj.label;
      if (!label || typeof label !== "string" || label.trim().length === 0) {
        return { ok: false, error: "Say what the \"Other\" support item is." };
      }
      if (label.length > 120) {
        return { ok: false, error: "Keep the \"Other\" item description to 120 characters." };
      }
    }

    // Validate requestedQty
    const qty = obj.requestedQty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 100000) {
      return { ok: false, error: `Enter a whole-number quantity from 1 to 100,000 for ${itemName(type as SupportItemType)}.` };
    }

    // Build the item (agents don't set allocation/delivery fields)
    items.push({
      item: type as SupportItemType,
      label: type === "other" ? (obj.label as string) : undefined,
      requestedQty: qty,
      deliveryStatus: "pending",
    });
  }

  return { ok: true, items };
}

/**
 * Allocation summary: none/partial/full based on allocatedQty vs requestedQty
 */
export function getAllocationSummary(supportItems: SupportItem[]): AllocationSummary {
  if (supportItems.length === 0) {
    return { status: "none", shortage: 0, allocatedCount: 0, totalItems: 0 };
  }

  let allocatedCount = 0;
  let shortage = 0;

  for (const item of supportItems) {
    const allocated = item.allocatedQty ?? 0;
    if (allocated > 0) {
      allocatedCount += 1;
    }
    if (allocated < item.requestedQty) {
      shortage += item.requestedQty - allocated;
    }
  }

  let status: "none" | "partial" | "full";
  if (allocatedCount === 0) {
    status = "none";
  } else if (allocatedCount === supportItems.length && shortage === 0) {
    status = "full";
  } else {
    status = "partial";
  }

  return { status, shortage, allocatedCount, totalItems: supportItems.length };
}

/**
 * Delivery summary: all delivered vs pending counts and issue flag
 */
export function getDeliverySummary(supportItems: SupportItem[]): DeliverySummary {
  if (supportItems.length === 0) {
    return { allDelivered: true, pendingCount: 0, hasIssues: false };
  }

  let pendingCount = 0;
  let hasIssues = false;

  for (const item of supportItems) {
    const status = item.deliveryStatus ?? "pending";
    if (status !== "delivered") {
      pendingCount += 1;
    }
    if (status === "issue") {
      hasIssues = true;
    }
  }

  return { allDelivered: pendingCount === 0, pendingCount, hasIssues };
}

/**
 * Validate admin allocation request.
 * Ensures allocatedQty ≤ requestedQty.
 */
export function validateAllocationRequest(
  items: { index?: number; _id?: string; allocatedQty: number; responsiblePerson?: string; allocationNote?: string }[],
  supportItems: SupportItem[],
): { ok: true } | { ok: false; error: string } {
  for (const req of items) {
    const item = req._id
      ? supportItems.find((s) => String(s._id) === String(req._id))
      : req.index !== undefined
        ? supportItems[req.index]
        : null;

    if (!item) {
      return { ok: false, error: "One of these support items no longer exists. Reload the request and try again." };
    }

    if (typeof req.allocatedQty !== "number" || !Number.isInteger(req.allocatedQty) || req.allocatedQty < 0 || req.allocatedQty > item.requestedQty) {
      return {
        ok: false,
        error: `Allocate between 0 and ${item.requestedQty} for ${itemName(item.item)} — that is what was requested.`,
      };
    }

    if (req.responsiblePerson && req.responsiblePerson.length > 120) {
      return { ok: false, error: "Keep the responsible person to 120 characters." };
    }

    if (req.allocationNote && req.allocationNote.length > 500) {
      return { ok: false, error: "Keep the allocation note to 500 characters." };
    }
  }

  return { ok: true };
}

/**
 * Validate admin delivery update request.
 * Ensures deliveredQty ≤ allocatedQty, "delivered" requires allocatedQty > 0 and deliveredQty > 0,
 * "issue" requires a deliveryNote.
 */
export function validateDeliveryRequest(
  items: { _id?: string; index?: number; deliveryStatus: string; deliveredQty?: number; deliveryNote?: string }[],
  supportItems: SupportItem[],
): { ok: true } | { ok: false; error: string } {
  for (const req of items) {
    const item = req._id
      ? supportItems.find((s) => String(s._id) === String(req._id))
      : req.index !== undefined
        ? supportItems[req.index]
        : null;

    if (!item) {
      return { ok: false, error: "One of these support items no longer exists. Reload the request and try again." };
    }

    const status = req.deliveryStatus as DeliveryStatus | undefined;
    if (!status || !DELIVERY_STATUSES.includes(status)) {
      return { ok: false, error: "Choose a delivery status: pending, ready, dispatched, delivered or issue." };
    }

    const allocatedQty = item.allocatedQty ?? 0;

    if (req.deliveredQty !== undefined && (typeof req.deliveredQty !== "number" || !Number.isInteger(req.deliveredQty) || req.deliveredQty < 0)) {
      return { ok: false, error: `Enter a whole-number delivered quantity for ${itemName(item.item)}.` };
    }

    if (status === "delivered") {
      if (allocatedQty === 0) {
        return { ok: false, error: `${itemName(item.item)} can't be marked delivered — nothing has been allocated for it yet.` };
      }
      const deliveredQty = req.deliveredQty ?? 0;
      if (deliveredQty <= 0 || deliveredQty > allocatedQty) {
        return {
          ok: false,
          error: `Enter how many ${itemName(item.item)} were delivered — between 1 and the ${allocatedQty} allocated.`,
        };
      }
    }

    if (status === "issue") {
      const note = req.deliveryNote ?? "";
      if (!note || note.trim().length === 0) {
        return { ok: false, error: `Add a delivery note saying what went wrong with ${itemName(item.item)}.` };
      }
    }

    if (req.deliveredQty && req.deliveredQty > allocatedQty) {
      return {
        ok: false,
        error: `${itemName(item.item)}: delivered (${req.deliveredQty}) can't be more than allocated (${allocatedQty}).`,
      };
    }

    if (req.deliveryNote && req.deliveryNote.length > 500) {
      return { ok: false, error: "Keep the delivery note to 500 characters." };
    }
  }

  return { ok: true };
}
