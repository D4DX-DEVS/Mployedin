/**
 * @jest-environment node
 *
 * POST /api/cv-export/complete: after the ZIP is built, the browser names the
 * candidates whose files are in it, and their pending records (written by the
 * manifest) become "done". Nothing else may be confirmed: the update only
 * matches this person's pending rows in this batch.
 */
import { NextRequest } from "next/server";

const oid = (n: number) => `65${"0".repeat(20)}${String(n).padStart(2, "0")}`;
const BATCH = oid(90);

type Ctx = { userId: string; role: string; locale: string };
let ctx: Ctx;

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, c: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await h(req, ctx);
      } catch (err) {
        if (err instanceof Response) return err;
        throw err;
      }
    },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const bulkWrite = jest.fn(async (ops: unknown[], _opts?: unknown) => ({ modifiedCount: ops.length }));
jest.mock("@/models/CvExportRecord", () => ({
  __esModule: true,
  CV_EXPORT_VERSIONS: ["standardised", "original"],
  default: { bulkWrite: (ops: unknown[], opts: unknown) => bulkWrite(ops, opts) },
}));

async function complete(body: unknown) {
  const { POST } = await import("@/app/api/cv-export/complete/route");
  const req = new NextRequest("http://localhost/api/cv-export/complete", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await (POST as unknown as (r: NextRequest, c: unknown) => Promise<Response>)(req, { params: Promise.resolve({}) });
  return { res, json: await res.json() };
}

type UpdateOp = { updateOne: { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } } };

beforeEach(() => {
  jest.clearAllMocks();
  ctx = { userId: oid(70), role: "admin", locale: "en" };
});

describe("POST /api/cv-export/complete", () => {
  it("confirms only this person's pending rows in this batch, one update per named candidate", async () => {
    const { res, json } = await complete({
      batchId: BATCH,
      items: [
        { seekerId: oid(1), versions: ["standardised", "original"] },
        { seekerId: oid(2), versions: ["original", "original"] },
      ],
    });
    expect(res.status).toBe(200);
    expect(json).toEqual({ recorded: 2 });
    const ops = bulkWrite.mock.calls[0][0] as UpdateOp[];
    expect(ops).toHaveLength(2);
    for (const [i, op] of ops.entries()) {
      const { filter, update } = op.updateOne;
      expect(String(filter.batchId)).toBe(BATCH);
      expect(String(filter.actorId)).toBe(oid(70));
      expect(String(filter.seekerId)).toBe(oid(i + 1));
      expect(filter.status).toBe("pending");
      expect(update.$set.status).toBe("done");
    }
    // A version named twice is recorded once.
    expect(ops[1].updateOne.update.$set.versions).toEqual(["original"]);
  });

  it.each([
    ["no items", { batchId: BATCH, items: [] }],
    ["a malformed batch id", { batchId: "nope", items: [{ seekerId: oid(1), versions: ["original"] }] }],
    ["an unknown version", { batchId: BATCH, items: [{ seekerId: oid(1), versions: ["zip"] }] }],
    ["no versions", { batchId: BATCH, items: [{ seekerId: oid(1), versions: [] }] }],
    ["an operator for a seeker id", { batchId: BATCH, items: [{ seekerId: { $ne: null }, versions: ["original"] }] }],
  ])("refuses %s (400) and writes nothing", async (_label, body) => {
    const { res } = await complete(body);
    expect(res.status).toBe(400);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("says the download is unaffected when the write fails", async () => {
    bulkWrite.mockRejectedValueOnce(new Error("db down"));
    const { res, json } = await complete({ batchId: BATCH, items: [{ seekerId: oid(1), versions: ["original"] }] });
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/download itself is not affected/);
  });
});
