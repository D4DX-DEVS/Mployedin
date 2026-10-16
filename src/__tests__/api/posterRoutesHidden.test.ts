/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/features/posterFeature", () => ({ POSTERS_ENABLED: false }));

const reached = () => {
  throw new Error("poster route reached past the gate");
};
jest.mock("@/lib/auth/withAuth", () => ({ withAuth: () => reached }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: reached }));
jest.mock("@/models/PosterGeneration", () => ({ __esModule: true, default: new Proxy({}, { get: () => reached }) }));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: new Proxy({}, { get: () => reached }) }));
jest.mock("@/models/Job", () => ({ __esModule: true, Job: new Proxy({}, { get: () => reached }) }));
jest.mock("@/lib/ai/openai", () => ({ generateImages: reached }));
jest.mock("@/lib/ai/gemini", () => ({ generateText: reached, GEMINI_MODELS: {} }));
jest.mock("@/lib/storage/spaces", () => ({ uploadBuffer: reached, deleteFile: reached, urlToKey: reached }));

const ctx = { params: Promise.resolve({ id: "64b000000000000000000001", slug: "abc" }) };
const req = (method: string) =>
  new NextRequest("http://localhost:3888/api/x", { method, body: method === "GET" || method === "DELETE" ? undefined : "{}" });

const ROUTES: [string, string][] = [
  ["@/app/api/ai/poster-generate/route", "POST"],
  ["@/app/api/ai/poster-more-variations/route", "POST"],
  ["@/app/api/ai/poster-content/route", "POST"],
  ["@/app/api/employers/posters/route", "GET"],
  ["@/app/api/employers/posters/route", "POST"],
  ["@/app/api/employers/posters/[id]/route", "GET"],
  ["@/app/api/employers/posters/[id]/route", "DELETE"],
  ["@/app/api/employers/poster-credits/route", "GET"],
  ["@/app/api/poster/[slug]/qr/route", "GET"],
  ["@/app/api/poster/[slug]/track/route", "POST"],
];

describe("poster API routes while posters are hidden", () => {
  it.each(ROUTES)("%s %s answers 404 before auth or DB", async (path, method) => {
    const mod = (await import(path)) as Record<string, (r: NextRequest, c: typeof ctx) => Promise<Response>>;
    const res = await mod[method](req(method), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
