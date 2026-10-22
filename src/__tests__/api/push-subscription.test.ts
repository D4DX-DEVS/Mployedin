/**
 * @jest-environment node
 *
 * Sign-out removes the browser's push subscription through DELETE
 * /api/push/subscription. The row is looked up by endpoint AND the signed-in
 * user: an endpoint is a bearer secret for pushing to a browser, so naming
 * someone else's endpoint must not delete their subscription.
 */
import { NextRequest } from "next/server";

const USER_A = "64b000000000000000000a01";
const USER_B = "64b000000000000000000b02";
const ENDPOINT_A = "https://push.example/endpoint-a";
const ENDPOINT_B = "https://push.example/endpoint-b";

let currentUser = USER_A;
const guards: { resource: string; action: string }[] = [];

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>, options: { resource: string; action: string }) => {
      guards.push(options);
      return async (req: NextRequest) => handler(req, { userId: currentUser, role: "job_seeker", locale: "en" });
    },
}));

interface Row { userId: string; endpoint: string }
let rows: Row[] = [];
const deleteOne = jest.fn(async (filter: Partial<Row>) => {
  const index = rows.findIndex((row) => Object.entries(filter).every(([key, value]) => row[key as keyof Row] === value));
  if (index >= 0) rows.splice(index, 1);
  return { deletedCount: index >= 0 ? 1 : 0 };
});
const findOneAndUpdate = jest.fn();
jest.mock("@/models/PushSubscription", () => ({
  __esModule: true,
  default: {
    deleteOne: (filter: Partial<Row>) => deleteOne(filter),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
}));

function deleteRequest(endpoint: string) {
  return new NextRequest("http://localhost/api/push/subscription", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

describe("DELETE /api/push/subscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = USER_A;
    rows = [
      { userId: USER_A, endpoint: ENDPOINT_A },
      { userId: USER_B, endpoint: ENDPOINT_B },
    ];
  });

  it("removes the caller's own subscription", async () => {
    const { DELETE } = await import("@/app/api/push/subscription/route");

    const res = await DELETE(deleteRequest(ENDPOINT_A), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(rows).toEqual([{ userId: USER_B, endpoint: ENDPOINT_B }]);
  });

  it("looks the row up by endpoint and the signed-in user, never by endpoint alone", async () => {
    const { DELETE } = await import("@/app/api/push/subscription/route");

    await DELETE(deleteRequest(ENDPOINT_A), { params: Promise.resolve({}) });

    expect(deleteOne).toHaveBeenCalledWith({ endpoint: ENDPOINT_A, userId: USER_A });
  });

  it("does not remove another user's subscription when their endpoint is named", async () => {
    const { DELETE } = await import("@/app/api/push/subscription/route");

    await DELETE(deleteRequest(ENDPOINT_B), { params: Promise.resolve({}) });

    expect(rows).toEqual([
      { userId: USER_A, endpoint: ENDPOINT_A },
      { userId: USER_B, endpoint: ENDPOINT_B },
    ]);
  });

  it("rejects a body without a valid endpoint", async () => {
    const { DELETE } = await import("@/app/api/push/subscription/route");

    // validateBody throws the 400 response; withAuth turns it into the reply.
    await expect(DELETE(deleteRequest("not-a-url"), { params: Promise.resolve({}) })).rejects.toMatchObject({ status: 400 });
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("registers both handlers behind the notifications:read guard", async () => {
    await import("@/app/api/push/subscription/route");

    expect(guards).toEqual([
      { resource: "notifications", action: "read" },
      { resource: "notifications", action: "read" },
    ]);
  });
});
