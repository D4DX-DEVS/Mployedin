/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import mongoose from "mongoose";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const canAccessInvoice = jest.fn().mockResolvedValue(true);

jest.mock("@/lib/invoices/access", () => ({
  canAccessInvoice: (...args: unknown[]) => canAccessInvoice(...args),
}));

const invoiceFindById = jest.fn();

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => invoiceFindById(...args),
  },
}));

interface MockInvoice {
  _id: string;
  invoiceNumber: string;
  status: string;
  userId: unknown;
  agentId?: unknown;
  sentAt?: Date | null;
  viewedAt?: Date | null;
  downloadedAt?: Date | null;
  reminderCount?: number;
  lastReminderAt?: Date | null;
  save: jest.Mock;
}

function makeInvoice(overrides: Partial<MockInvoice> = {}): MockInvoice {
  return {
    _id: "507f1f77bcf86cd799439061",
    invoiceNumber: "INV-202605-00001",
    status: "issued",
    userId: "employer_user_001",
    agentId: "agent_001",
    sentAt: null,
    viewedAt: null,
    downloadedAt: null,
    reminderCount: 0,
    lastReminderAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function deliveryRequest(action: string) {
  return new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439061/delivery", {
    method: "POST",
    body: JSON.stringify({ action }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Invoice delivery tracking API", () => {
  const { auth } = require("@/lib/auth/config");
  const { logActivity } = require("@/lib/audit/log");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    canAccessInvoice.mockResolvedValue(true);
  });

  it("marks an issued invoice as sent with the first sent timestamp", async () => {
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("sent"), { params: Promise.resolve({ id: invoice._id }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(invoice.status).toBe("sent");
    expect(invoice.sentAt).toBeInstanceOf(Date);
    expect(invoice.save).toHaveBeenCalled();
    expect(json.invoice.deliveryState).toBe("sent");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "invoice.delivery_sent",
      resourceId: invoice._id,
    }));
  });

  it("does not replace an existing sent timestamp", async () => {
    const originalSentAt = new Date("2026-05-10T09:00:00.000Z");
    const invoice = makeInvoice({ status: "sent", sentAt: originalSentAt });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("sent"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(200);
    expect(invoice.sentAt).toBe(originalSentAt);
  });

  it("increments reminder tracking only after an invoice is sent", async () => {
    const previousReminder = new Date("2026-05-11T09:00:00.000Z");
    const invoice = makeInvoice({
      status: "sent",
      sentAt: new Date("2026-05-10T09:00:00.000Z"),
      reminderCount: 1,
      lastReminderAt: previousReminder,
    });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("reminder"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(200);
    expect(invoice.reminderCount).toBe(2);
    expect(invoice.lastReminderAt).toBeInstanceOf(Date);
    expect(invoice.lastReminderAt).not.toBe(previousReminder);
    expect(invoice.save).toHaveBeenCalled();
  });

  it("blocks reminders before an invoice is sent", async () => {
    const invoice = makeInvoice({ status: "issued", sentAt: null });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("reminder"), { params: Promise.resolve({ id: invoice._id }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("sent");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("caps reminders at ten per invoice", async () => {
    const invoice = makeInvoice({
      status: "sent",
      sentAt: new Date("2026-05-10T09:00:00.000Z"),
      reminderCount: 10,
      lastReminderAt: new Date("2026-05-11T09:00:00.000Z"),
    });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("reminder"), { params: Promise.resolve({ id: invoice._id }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Maximum reminders");
    expect(invoice.reminderCount).toBe(10);
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("does not allow paid invoices to be newly marked sent", async () => {
    const invoice = makeInvoice({ status: "paid", sentAt: null });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("sent"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(400);
    expect(invoice.status).toBe("paid");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("allows the invoice owner to record the first viewed timestamp", async () => {
    auth.mockResolvedValue({ user: { id: "employer_user_001", role: "employer", locale: "en" } });
    const invoice = makeInvoice({ status: "sent", sentAt: new Date("2026-05-10T09:00:00.000Z") });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("viewed"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(200);
    expect(invoice.viewedAt).toBeInstanceOf(Date);
    expect(invoice.save).toHaveBeenCalled();
  });

  it("matches ObjectId invoice owners with authenticated owner strings", async () => {
    const ownerId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439099");
    auth.mockResolvedValue({ user: { id: ownerId.toHexString(), role: "employer", locale: "en" } });
    const invoice = makeInvoice({
      userId: ownerId,
      status: "sent",
      sentAt: new Date("2026-05-10T09:00:00.000Z"),
    });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("viewed"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(200);
    expect(invoice.viewedAt).toBeInstanceOf(Date);
  });

  it("records download and backfills viewedAt when missing", async () => {
    auth.mockResolvedValue({ user: { id: "employer_user_001", role: "employer", locale: "en" } });
    const invoice = makeInvoice({ status: "sent", sentAt: new Date("2026-05-10T09:00:00.000Z") });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("downloaded"), { params: Promise.resolve({ id: invoice._id }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(invoice.viewedAt).toBeInstanceOf(Date);
    expect(invoice.downloadedAt).toBeInstanceOf(Date);
    expect(json.invoice.deliveryState).toBe("downloaded");
  });

  it("blocks non-owner users from recording employer viewed events", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    const invoice = makeInvoice({ status: "sent", sentAt: new Date("2026-05-10T09:00:00.000Z") });
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("viewed"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(403);
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("blocks agents from marking invoices sent", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("sent"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(403);
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("rejects inaccessible invoices", async () => {
    canAccessInvoice.mockResolvedValue(false);
    const invoice = makeInvoice();
    invoiceFindById.mockResolvedValue(invoice);

    const { POST } = await import("@/app/api/invoices/[id]/delivery/route");
    const res = await POST(deliveryRequest("sent"), { params: Promise.resolve({ id: invoice._id }) });

    expect(res.status).toBe(403);
    expect(invoice.save).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "invoice.access_denied",
    }));
  });
});