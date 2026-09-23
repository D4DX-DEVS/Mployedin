/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "admin_1", role: "admin", locale: "en" }),
}));

const query = (rows: unknown[]) => {
  const q: Record<string, unknown> = {};
  q.populate = jest.fn(() => q);
  q.sort = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(rows);
  return q;
};
const invoiceFind = jest.fn();
const invoiceCount = jest.fn();
const commissionFind = jest.fn();
const commissionCount = jest.fn();
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => invoiceFind(...a), countDocuments: (...a: unknown[]) => invoiceCount(...a) },
}));
jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => commissionFind(...a), countDocuments: (...a: unknown[]) => commissionCount(...a) },
}));
jest.mock("@/models/Employer", () => ({}));
jest.mock("@/models/Agent", () => ({}));
jest.mock("@/models/SuperAgent", () => ({}));

const get = async (qs: string) => {
  const { GET } = await import("@/app/api/admin/export/financial/route");
  return GET(new NextRequest(`http://localhost/api/admin/export/financial?${qs}`), { params: Promise.resolve({}) });
};

beforeEach(() => {
  jest.clearAllMocks();
  invoiceCount.mockResolvedValue(1);
  commissionCount.mockResolvedValue(0);
  invoiceFind.mockReturnValue(query([
    { invoiceNumber: "INV-1", category: "recruitment", type: "invoice", amount: 100, currency: "AED", status: "paid", employerId: { companyName: "=HYPERLINK(\"http://x\")" }, description: "ok" },
  ]));
  commissionFind.mockReturnValue(query([]));
});

describe("GET /api/admin/export/financial", () => {
  it("rejects an unparseable date with 400 instead of a database error", async () => {
    const res = await get("dateFrom=not-a-date");
    expect(res.status).toBe(400);
    expect(invoiceFind).not.toHaveBeenCalled();
  });

  it("refuses a range over the row cap without loading it", async () => {
    invoiceCount.mockResolvedValue(20_001);
    const res = await get("type=invoices");
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Narrow the date range/);
    expect(invoiceFind).not.toHaveBeenCalled();
  });

  it("neutralises formula cells in the CSV", async () => {
    const res = await get("type=invoices&format=csv");
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it("writes no line a spreadsheet would read as a formula (section labels included)", async () => {
    const csv = await (await get("type=both&format=csv")).text();
    const cells = csv.split(/\r?\n/).flatMap((line) => line.split(","));
    expect(cells.filter((c) => /^[=+\-@]/.test(c))).toEqual([]);
  });
});
