/**
 * @jest-environment node
 *
 * On 2026-10-27 two hosted processes were writing to two different MongoDB
 * clusters, and nothing any of them logged said which one. Every connection now
 * logs its target — cluster host with the first label masked, plus the database
 * name, never credentials — so two deployments can be compared from their logs.
 * A connection to the driver's default database is only warned about: a URI
 * with no database path silently lands in the empty `test` database.
 */
import { describeDbTarget, isDefaultDatabase, maskDbHost } from "@/lib/db/dbTarget";

describe("maskDbHost", () => {
  it("masks the first label and keeps the cluster domain", () => {
    expect(maskDbHost("ac-xyz9fix-shard-00-01.fx0test.mongodb.net")).toBe("ac-x…fx0test.mongodb.net");
  });

  it("leaves a single-label host recognisable", () => {
    expect(maskDbHost("localhost")).toBe("localhost");
  });

  it("names a missing host instead of printing nothing", () => {
    expect(maskDbHost(undefined)).toBe("unknown host");
    expect(maskDbHost("")).toBe("unknown host");
  });
});

describe("describeDbTarget", () => {
  it("joins the masked host and the database name", () => {
    expect(describeDbTarget({ host: "ac-xyz9fix-shard-00-01.fx0test.mongodb.net", name: "mployedin" })).toBe(
      "ac-x…fx0test.mongodb.net/mployedin",
    );
  });

  it("says so when no database is named", () => {
    expect(describeDbTarget({ host: "localhost", name: "" })).toBe("localhost/(no database)");
  });
});

describe("isDefaultDatabase", () => {
  it.each([["test", true], ["", true], [undefined, true], ["mployedin", false]])("%p → %p", (name, expected) => {
    expect(isDefaultDatabase(name as string | undefined)).toBe(expected);
  });
});

describe("connectDB logs where it connected", () => {
  const info = jest.fn();
  const warn = jest.fn();
  let connection: Record<string, unknown> = {};

  beforeAll(() => {
    // A made-up URI, assembled from parts so secret scanners do not read the
    // fixture as a leaked Atlas credential (GitHub flagged the literal form).
    process.env.MONGODB_URI = ["mongodb+srv://", "fixtureuser", ":", "fixturepass", "@cluster0.fx0test.mongodb.net/mployedin"].join("");
  });

  beforeEach(() => {
    global.mongooseCache = undefined;
    jest.resetModules();
    info.mockClear();
    warn.mockClear();
    jest.doMock("@/lib/db/indexes", () => ({ ensureIndexes: async () => undefined }));
    jest.doMock("@/lib/logger", () => ({ __esModule: true, default: { info, warn, error: jest.fn() } }));
    jest.doMock("mongoose", () => ({
      __esModule: true,
      default: { connect: jest.fn(async () => ({ connection })) },
    }));
  });

  it("logs the masked target once, without credentials", async () => {
    connection = { host: "ac-xyz9fix-shard-00-01.fx0test.mongodb.net", name: "mployedin" };
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    await connectDB();

    const connected = info.mock.calls.filter(([, msg]) => msg === "MongoDB connected");
    expect(connected).toEqual([[{ db: "ac-x…fx0test.mongodb.net/mployedin" }, "MongoDB connected"]]);
    expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toMatch(/fixturepass|fixtureuser/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, but still connects, when it landed in the default database", async () => {
    connection = { host: "ac-xyz9fix-shard-00-01.fx0test.mongodb.net", name: "test" };
    const { connectDB } = await import("@/lib/db/mongoose");
    await expect(connectDB()).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      { db: "ac-x…fx0test.mongodb.net/test" },
      expect.stringContaining("default database"),
    );
  });
});
