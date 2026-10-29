/**
 * @jest-environment node
 */
/**
 * Admin > GDPR > Consent Logs > Other consents > View: one Terms, marketing or
 * sign-up cookie entry with the account's other answers of the same type.
 */
import { NextRequest, NextResponse } from "next/server";

let ctxRole: "admin" | "super_agent" = "admin";
const ADMIN_ID = "64d000000000000000000001";
const USER_ID = "64d000000000000000000003";
const ENTRY_ID = "64d0000000000000000000b2";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn().mockResolvedValue(result);
  return c;
}

const findById = jest.fn((..._args: unknown[]) => chain(null));
const find = jest.fn((..._args: unknown[]) => chain([]));
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: { findById: (...a: unknown[]) => findById(...a), find: (...a: unknown[]) => find(...a) },
}));

const userFind = jest.fn((..._args: unknown[]) => chain([{ _id: USER_ID, email: "sara@example.com", deletedAt: null }]));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a) },
}));

const getCurrentTermsVersion = jest.fn().mockResolvedValue("2026-10-22");
jest.mock("@/lib/gdpr/termsVersion", () => ({ getCurrentTermsVersion: () => getCurrentTermsVersion() }));

const stored = (over: Record<string, unknown> = {}) => ({
  _id: ENTRY_ID,
  userId: USER_ID,
  userName: "Sara Ahmed",
  consentType: "terms_and_privacy",
  granted: true,
  source: "registration",
  policyVersion: "2026-09-29",
  createdAt: new Date("2026-09-30T09:30:00Z"),
  ...over,
});

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

async function get(id: string) {
  const { GET } = await import("@/app/api/admin/gdpr/consent/entries/[id]/route");
  const res = await GET(new NextRequest(`http://localhost/api/admin/gdpr/consent/entries/${id}`), ctx({ id }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
});

describe("GET /api/admin/gdpr/consent/entries/[id]", () => {
  it("is admin only", async () => {
    ctxRole = "super_agent";
    expect((await get(ENTRY_ID)).status).toBe(403);
    expect(findById).not.toHaveBeenCalled();
  });

  it("refuses an id that is not an ObjectId", async () => {
    expect((await get("not-an-id")).status).toBe(400);
  });

  it("404 for a missing entry and for a per-category cookie row (those are cookie choices)", async () => {
    expect((await get(ENTRY_ID)).status).toBe(404);
    findById.mockReturnValueOnce(chain(stored({ consentType: "cookies.media" })));
    expect((await get(ENTRY_ID)).status).toBe(404);
  });

  it("sends the entry with the account's e-mail, never selecting the IP address", async () => {
    findById.mockReturnValueOnce(chain(stored()));
    const { status, body } = await get(ENTRY_ID);

    expect(status).toBe(200);
    expect(body.entry).toMatchObject({ _id: ENTRY_ID, userName: "Sara Ahmed", userEmail: "sara@example.com", consentType: "terms_and_privacy", granted: true, source: "registration" });
    const selected = (findById.mock.results[0].value as { select: jest.Mock }).select.mock.calls[0][0] as string;
    expect(selected).not.toMatch(/ip/i);
    expect(JSON.stringify(body)).not.toMatch(/ipAddress|userAgent/);
  });

  it("marks it replaced when a later answer of the same type exists, and tags the history", async () => {
    findById.mockReturnValueOnce(chain(stored()));
    find.mockReturnValueOnce(chain([
      stored({ _id: "64d0000000000000000000b3", createdAt: new Date("2026-10-22T11:00:00Z"), source: "terms_update", policyVersion: "2026-10-22" }),
      stored({ _id: "64d0000000000000000000b1", createdAt: new Date("2026-09-01T08:00:00Z"), granted: false }),
    ]));
    const { body } = await get(ENTRY_ID);

    expect(body.status).toBe("replaced");
    expect(body.history.map((h: { relation: string }) => h.relation)).toEqual(["later", "earlier"]);
    const query = find.mock.calls[0][0] as Record<string, unknown>;
    expect(query).toMatchObject({ userId: USER_ID, consentType: "terms_and_privacy" });
  });

  it("says whether a Terms entry accepted today's version", async () => {
    findById.mockReturnValueOnce(chain(stored()));
    expect((await get(ENTRY_ID)).body.termsVersion).toBe("older");
    findById.mockReturnValueOnce(chain(stored({ policyVersion: "2026-10-22" })));
    expect((await get(ENTRY_ID)).body.termsVersion).toBe("current");
  });

  it("no version verdict for marketing, and the current status when nothing is later", async () => {
    findById.mockReturnValueOnce(chain(stored({ consentType: "marketing", policyVersion: null, source: "privacy_settings" })));
    const { body } = await get(ENTRY_ID);

    expect(body.termsVersion).toBeNull();
    expect(body.status).toBe("current");
    expect(getCurrentTermsVersion).not.toHaveBeenCalled();
  });

  it("shows an erased account as Deleted User with no e-mail", async () => {
    findById.mockReturnValueOnce(chain(stored()));
    userFind.mockReturnValueOnce(chain([{ _id: USER_ID, email: "deleted_x@anonymized.mployedin.com", deletedAt: new Date() }]));
    const { body } = await get(ENTRY_ID);

    expect(body.entry.userName).toBe("Deleted User");
    expect(body.entry.userEmail).toBeNull();
  });
});
