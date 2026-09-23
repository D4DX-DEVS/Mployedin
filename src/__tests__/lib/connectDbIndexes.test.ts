/**
 * @jest-environment node
 *
 * ensureIndexes() takes ~17s against the hosted database (60+ createIndexes
 * round trips). It used to run inside connectDB()'s promise, so every request in
 * the first 17s after a deploy waited for it. Indexes persist in MongoDB, so the
 * reconcile runs in the background and requests only wait for the connection.
 */
process.env.MONGODB_URI = "mongodb://localhost/test";

let releaseIndexes: () => void = () => {};
const ensureIndexes = jest.fn(() => new Promise<void>((resolve) => { releaseIndexes = resolve; }));
jest.mock("@/lib/db/indexes", () => ({ ensureIndexes: () => ensureIndexes() }));

const logError = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), error: (...a: unknown[]) => logError(...a), warn: jest.fn() } }));

jest.mock("mongoose", () => {
  const instance = { connection: {} };
  return { __esModule: true, default: { connect: jest.fn().mockResolvedValue(instance) } };
});

beforeEach(() => {
  global.mongooseCache = undefined;
  jest.resetModules();
  ensureIndexes.mockClear();
  logError.mockClear();
});

it("resolves once connected, without waiting for the index reconcile", async () => {
  const { connectDB } = await import("@/lib/db/mongoose");
  const conn = await Promise.race([
    connectDB(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("connectDB waited for ensureIndexes")), 500)),
  ]);
  expect(conn).toBeTruthy();
  expect(ensureIndexes).toHaveBeenCalledTimes(1);
  releaseIndexes();
});

it("logs a failed reconcile instead of failing the request", async () => {
  ensureIndexes.mockImplementationOnce(() => Promise.reject(new Error("index boom")));
  const { connectDB } = await import("@/lib/db/mongoose");
  await expect(connectDB()).resolves.toBeTruthy();
  await new Promise((r) => setImmediate(r));
  expect(logError).toHaveBeenCalled();
});
