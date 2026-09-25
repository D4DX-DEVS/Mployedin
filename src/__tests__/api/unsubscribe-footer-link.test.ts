/**
 * @jest-environment node
 *
 * The link in a real digest footer, handed to the real unsubscribe route.
 *
 * unsubscribeLink.test.ts proves the token verifies against the secret; this
 * proves the whole trip — the URL the email prints, parsed the way a mail
 * client follows it, turns off job emails for that seeker and nothing else.
 * Before the fix the same click returned 400 "Missing unsubscribe token".
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { updateOne: (...args: unknown[]) => updateOne(...args) },
}));
jest.mock("@/models/SavedSearch", () => ({
  __esModule: true,
  default: { findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));

describe("digest footer → /api/unsubscribe", () => {
  const ORIGINAL = process.env.NEXTAUTH_SECRET;

  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "footer-route-secret";
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = ORIGINAL;
  });

  it("turns off job emails for exactly that seeker", async () => {
    // Imported after the secret is set: the route reads it at module load.
    const { buildDigestEmail } = await import("@/lib/inngest/dailyDigestWorker");
    const { GET } = await import("@/app/api/unsubscribe/route");

    const html = buildDigestEmail({
      userId: "seeker-77",
      userName: "Asha",
      locale: "en",
      jobs: [],
      profileViews: { count: 0, viewers: [] },
      profile: { completeness: 80, signals: 4 },
    });
    const href = html.match(/href="([^"]*\/api\/unsubscribe[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
    expect(href).toBeDefined();

    const res = await GET(new NextRequest(href!));

    expect(res.status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith(
      { userId: "seeker-77" },
      { $set: { "categories.jobs.enabled": false } },
      { upsert: true },
    );
    // Category-scoped: interview invites and password resets keep flowing.
    expect(updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      { $set: { unsubscribedAll: true } },
      expect.anything(),
    );
  });
});
