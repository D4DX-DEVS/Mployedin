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

  /**
   * Saved-search alerts were removed, but their emails carried 90-day links
   * with a savedSearchId and no category. Falling through would read as
   * "unsubscribe from everything" — interview invites included.
   */
  it.each(["GET", "POST"] as const)(
    "%s with a retired saved-search link changes no preferences",
    async (method) => {
      updateOne.mockClear();
      const jwt = (await import("jsonwebtoken")).default;
      const { unsubscribeSecret } = await import("@/lib/communications/unsubscribeLink");
      const route = await import("@/app/api/unsubscribe/route");
      const token = jwt.sign(
        { userId: "seeker-77", savedSearchId: "65f000000000000000000001" },
        unsubscribeSecret()!,
        { algorithm: "HS256" },
      );

      const res = await route[method](
        new NextRequest(`http://localhost/api/unsubscribe?token=${token}`, { method }),
      );

      expect(res.status).toBe(200);
      expect(updateOne).not.toHaveBeenCalled();
    },
  );
});
