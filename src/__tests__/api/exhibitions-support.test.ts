/**
 * @jest-environment node
 */
/**
 * PATCH /api/exhibitions/[id]/support — the admin records what was allocated
 * against each requested support item and how its delivery stands. Nothing is
 * allocated or delivered unless the server saves it, and the stage, quantity
 * and note rules are enforced here, not just in the dialog.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

const findOne = jest.fn();
jest.mock("@/models/ExhibitionRequest", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => findOne(...a) },
}));

import mongoose from "mongoose";
import { PATCH } from "@/app/api/exhibitions/[id]/support/route";

const ID = "64b000000000000000000001";
const TV = "64b0000000000000000000a1";
const VOL = "64b0000000000000000000a2";

function makeDoc(status: string, lines?: Record<string, unknown>[]) {
  const doc = {
    _id: ID,
    status,
    supportItems: lines ?? [
      { _id: new mongoose.Types.ObjectId(TV), item: "tv", requestedQty: 2, deliveryStatus: "pending" },
      { _id: new mongoose.Types.ObjectId(VOL), item: "volunteers", requestedQty: 3, deliveryStatus: "pending" },
    ],
    statusHistory: [] as Record<string, unknown>[],
    increment: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    toJSON() { return { _id: this._id, status: this.status, supportItems: this.supportItems, statusHistory: this.statusHistory }; },
  };
  findOne.mockResolvedValue(doc);
  return doc;
}

function call(body: unknown, role = "admin", id = ID) {
  const req = new NextRequest(`http://t/api/exhibitions/${id}/support`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return (PATCH as unknown as (r: NextRequest, c: unknown, p: unknown) => Promise<Response>)(
    req,
    { userId: "64b0000000000000000000ad", role },
    { id },
  );
}

beforeEach(() => findOne.mockReset());

describe("PATCH /api/exhibitions/[id]/support", () => {
  it("is admin-only: an agent or super agent gets 403 and nothing is read", async () => {
    for (const role of ["agent", "super_agent"]) {
      const res = await call({ action: "allocate", items: [] }, role);
      expect(res.status).toBe(403);
    }
    expect(findOne).not.toHaveBeenCalled();
  });

  it("404s an id that is not an ObjectId instead of throwing a cast error", async () => {
    const res = await call({ action: "allocate", items: [] }, "admin", "not-an-id");
    expect(res.status).toBe(404);
  });

  it("allocates by item id, keeps the volunteer line separate, logs it and saves with a version check", async () => {
    const doc = makeDoc("budget_approved");
    const res = await call({
      action: "allocate",
      items: [
        { _id: TV, allocatedQty: 1, responsiblePerson: "Store team" },
        { _id: VOL, allocatedQty: 3 },
      ],
    });
    expect(res.status).toBe(200);
    expect(doc.supportItems[0]).toMatchObject({ allocatedQty: 1, responsiblePerson: "Store team" });
    expect(doc.supportItems[1]).toMatchObject({ allocatedQty: 3 });
    // Allocation never moves the stage on its own.
    expect(doc.status).toBe("budget_approved");
    expect(doc.statusHistory).toHaveLength(1);
    expect(doc.statusHistory[0]).toMatchObject({ status: "budget_approved", approverRole: "admin" });
    expect(String(doc.statusHistory[0].note)).toContain("tv 1/2");
    expect(doc.increment).toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalled();
  });

  it("refuses to allocate more than was requested, or a fraction", async () => {
    const doc = makeDoc("resources_assigned");
    expect((await call({ action: "allocate", items: [{ _id: TV, allocatedQty: 3 }] })).status).toBe(400);
    expect((await call({ action: "allocate", items: [{ _id: TV, allocatedQty: 1.5 }] })).status).toBe(400);
    expect((await call({ action: "allocate", items: [{ _id: TV, allocatedQty: -1 }] })).status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("allocation is closed before the budget is approved (409)", async () => {
    const doc = makeDoc("under_review");
    const res = await call({ action: "allocate", items: [{ _id: TV, allocatedQty: 1 }] });
    expect(res.status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("an unknown line id is a 400, not a silent no-op", async () => {
    makeDoc("budget_approved");
    const res = await call({ action: "allocate", items: [{ _id: "64b0000000000000000000ff", allocatedQty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("delivery: 'delivered' needs an allocation and a quantity within it", async () => {
    const lines = [
      { _id: new mongoose.Types.ObjectId(TV), item: "tv", requestedQty: 2, allocatedQty: 2, deliveryStatus: "pending" },
      { _id: new mongoose.Types.ObjectId(VOL), item: "volunteers", requestedQty: 3, deliveryStatus: "pending" },
    ];
    let doc = makeDoc("resources_assigned", lines);
    // Nothing allocated for volunteers.
    expect((await call({ action: "delivery", items: [{ _id: VOL, deliveryStatus: "delivered", deliveredQty: 1 }] })).status).toBe(400);
    // More than allocated.
    expect((await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "delivered", deliveredQty: 3 }] })).status).toBe(400);
    // No quantity.
    expect((await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "delivered" }] })).status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();

    doc = makeDoc("resources_assigned", lines.map((l) => ({ ...l })));
    const ok = await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "delivered", deliveredQty: 2 }] });
    expect(ok.status).toBe(200);
    expect(doc.supportItems[0]).toMatchObject({ deliveryStatus: "delivered", deliveredQty: 2 });
    expect(doc.status).toBe("resources_assigned");
  });

  it("delivery: an issue needs a note; an unknown status is refused", async () => {
    const doc = makeDoc("active");
    expect((await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "issue" }] })).status).toBe(400);
    expect((await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "lost" }] })).status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
    const ok = await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "issue", deliveryNote: "Screen cracked" }] });
    expect(ok.status).toBe(200);
    expect(doc.supportItems[0]).toMatchObject({ deliveryStatus: "issue", deliveryNote: "Screen cracked" });
  });

  // Owner, 2026-10-15: support is decided in the payment approval, so
  // delivery opens at budget_approved and stays closed until then.
  it("delivery is closed before the payment is approved (409)", async () => {
    makeDoc("approved");
    const res = await call({ action: "delivery", items: [{ _id: TV, deliveryStatus: "ready" }] });
    expect(res.status).toBe(409);
  });

  it("a concurrent save (VersionError) is a 409 asking to reload, not a 500", async () => {
    const doc = makeDoc("budget_approved");
    doc.save.mockRejectedValueOnce(new mongoose.Error.VersionError({ _doc: { _id: ID } } as never, 1, []));
    const res = await call({ action: "allocate", items: [{ _id: TV, allocatedQty: 1 }] });
    expect(res.status).toBe(409);
  });

  it("an unknown action or a missing items list is a 400", async () => {
    makeDoc("budget_approved");
    expect((await call({ action: "ship", items: [] })).status).toBe(400);
    expect((await call({ action: "allocate" })).status).toBe(400);
  });
});
