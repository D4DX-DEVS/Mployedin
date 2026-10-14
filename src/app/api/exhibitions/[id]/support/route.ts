import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import {
  validateAllocationRequest,
  validateDeliveryRequest,
  type SupportItem,
} from "@/lib/exhibitions/supportItems";

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  // Only admin can manage support allocation and delivery
  if (ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can manage support allocation and delivery" },
      { status: 403 },
    );
  }

  if (!mongoose.isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  const item = await ExhibitionRequest.findOne({
    _id: params?.id,
    isDeleted: { $ne: true },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing or invalid action/items" }, { status: 400 });
  }
  const { action, items } = body;

  if (!action || !items || !Array.isArray(items)) {
    return NextResponse.json(
      { error: "Missing or invalid action/items" },
      { status: 400 },
    );
  }

  const supportItems = (item.supportItems as SupportItem[]) ?? [];

  /* ------------------------------------------------------------------ */
  /*  Allocate resources                                                */
  /* ------------------------------------------------------------------ */
  if (action === "allocate") {
    // Only allowed in budget_approved or resources_assigned status
    if (!["budget_approved", "resources_assigned"].includes(item.status)) {
      return NextResponse.json(
        { error: `Cannot allocate in status "${item.status}" — allowed: budget_approved, resources_assigned` },
        { status: 409 },
      );
    }

    const validation = validateAllocationRequest(items, supportItems);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Apply allocations
    for (const req of items) {
      const idx = req._id
        ? supportItems.findIndex((s) => s._id?.toString() === req._id)
        : req.index;

      if (idx >= 0) {
        const support = supportItems[idx];
        support.allocatedQty = req.allocatedQty;
        support.responsiblePerson = req.responsiblePerson ?? support.responsiblePerson;
        support.allocationNote = req.allocationNote ?? support.allocationNote;
        support.updatedAt = new Date();
        support.updatedBy = ctx.userId as unknown as typeof support.updatedBy;
      }
    }

    // Build summary for status history
    const summary = items
      .map((req) => {
        const item = req._id
          ? supportItems.find((s) => s._id?.toString() === req._id)
          : supportItems[req.index ?? 0];
        return item ? `${item.item} ${req.allocatedQty}/${item.requestedQty}` : "";
      })
      .filter(Boolean)
      .join(", ");

    item.supportItems = supportItems;
    item.statusHistory.push({
      status: item.status,
      changedAt: new Date(),
      changedBy: ctx.userId as unknown as typeof item.reviewedBy,
      note: `Allocation updated: ${summary}`,
      approverRole: "admin",
    });

    return saveGuarded(item);
  }

  /* ------------------------------------------------------------------ */
  /*  Update delivery                                                    */
  /* ------------------------------------------------------------------ */
  if (action === "delivery") {
    // Only allowed in resources_assigned or active status
    if (!["resources_assigned", "active"].includes(item.status)) {
      return NextResponse.json(
        { error: `Cannot update delivery in status "${item.status}" — allowed: resources_assigned, active` },
        { status: 409 },
      );
    }

    const validation = validateDeliveryRequest(items, supportItems);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Apply delivery updates
    for (const req of items) {
      const idx = req._id
        ? supportItems.findIndex((s) => s._id?.toString() === req._id)
        : req.index;

      if (idx >= 0) {
        const support = supportItems[idx];
        support.deliveryStatus = (req.deliveryStatus as SupportItem["deliveryStatus"]) ?? support.deliveryStatus;
        support.deliveredQty = req.deliveredQty ?? support.deliveredQty;
        support.deliveryNote = req.deliveryNote ?? support.deliveryNote;
        support.updatedAt = new Date();
        support.updatedBy = ctx.userId as unknown as typeof support.updatedBy;
      }
    }

    // Build summary for status history
    const summary = items
      .map((req) => {
        const item = req._id
          ? supportItems.find((s) => s._id?.toString() === req._id)
          : supportItems[req.index ?? 0];
        return item ? `${item.item}: ${req.deliveryStatus}` : "";
      })
      .filter(Boolean)
      .join(", ");

    item.supportItems = supportItems;
    item.statusHistory.push({
      status: item.status,
      changedAt: new Date(),
      changedBy: ctx.userId as unknown as typeof item.reviewedBy,
      note: `Delivery updated: ${summary}`,
      approverRole: "admin",
    });

    return saveGuarded(item);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const PATCH = withAuth(patchHandler, { resource: "exhibitions", action: "update" });

/**
 * Optimistic concurrency: `increment()` puts the version in the save's filter,
 * so two admins saving the same request at once cannot overwrite each other's
 * allocation — the second gets a 409 and reloads.
 */
async function saveGuarded(item: InstanceType<typeof ExhibitionRequest>) {
  item.increment();
  try {
    await item.save();
  } catch (err) {
    if (err instanceof mongoose.Error.VersionError) {
      return NextResponse.json(
        { error: "Someone else updated this request just now. Reload it and try again." },
        { status: 409 },
      );
    }
    throw err;
  }
  return NextResponse.json(item);
}
