/**
 * @jest-environment node
 */
let mockEnabled = false;
jest.mock("@/lib/features/posterFeature", () => ({
  get POSTERS_ENABLED() {
    return mockEnabled;
  },
}));

import { gatePosters } from "@/lib/features/posterGate";

describe("gatePosters", () => {
  it("answers 404 and never calls the handler while posters are off", async () => {
    mockEnabled = false;
    const handler = jest.fn(async () => new Response("ok"));
    const res = await gatePosters(handler)();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes every argument through to the handler while posters are on", async () => {
    mockEnabled = true;
    const handler = jest.fn(async (_a: string, _b: number) => new Response("ok", { status: 201 }));
    const res = await gatePosters(handler)("req", 7);
    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledWith("req", 7);
  });
});
