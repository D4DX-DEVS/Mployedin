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
    expect(maskDbHost("ac-pcc6abc-shard-00-01.alklmea.mongodb.net")).toBe("ac-p…alklmea.mongodb.net");
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
    expect(describeDbTarget({ host: "ac-pcc6abc-shard-00-01.alklmea.mongodb.net", name: "mployedin" })).toBe(
      "ac-p…alklmea.mongodb.net/mployedin",
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
    process.env.MONGODB_URI = "mongodb+srv://appuser:secretpass@cluster0.alklmea.mongodb.net/mployedin";
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
    connection = { host: "ac-pcc6abc-shard-00-01.alklmea.mongodb.net", name: "mployedin" };
    const { connectDB } = await import("@/lib/db/mongoose");
    await connectDB();
    await connectDB();

    const connected = info.mock.calls.filter(([, msg]) => msg === "MongoDB connected");
    expect(connected).toEqual([[{ db: "ac-p…alklmea.mongodb.net/mployedin" }, "MongoDB connected"]]);
    expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toMatch(/secretpass|appuser/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, but still connects, when it landed in the default database", async () => {
    connection = { host: "ac-pcc6abc-shard-00-01.alklmea.mongodb.net", name: "test" };
    const { connectDB } = await import("@/lib/db/mongoose");
    await expect(connectDB()).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      { db: "ac-p…alklmea.mongodb.net/test" },
      expect.stringContaining("default database"),
    );
  });
});
