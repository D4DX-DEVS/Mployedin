/**
 * @jest-environment node
 *
 * The Worker end to end through its fetch handler: signing (with the APP's
 * signer, so the two sides cannot drift), log writes and reads on real SQLite,
 * vectors, and error handling.
 */
import worker from "../index";
import { MAX_SKEW_MS, verifyRequest } from "../auth";
import { signWorkerRequest } from "../../../../src/lib/cloudflare/dataWorkerClient";
import { TEST_SECRET, testEnv, type TestEnv } from "./testEnv";

const BASE = "https://data.test";

function signed(method: "GET" | "POST", pathWithQuery: string, payload?: unknown, opts: { secret?: string; at?: number } = {}): Request {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const ts = String(opts.at ?? Date.now());
  return new Request(`${BASE}${pathWithQuery}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-mp-timestamp": ts,
      "x-mp-signature": signWorkerRequest(opts.secret ?? TEST_SECRET, ts, method, pathWithQuery, body),
    },
    ...(body && { body }),
  });
}

async function call(env: TestEnv, req: Request): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await worker.fetch(req, env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const T0 = Date.UTC(2026, 9, 1);

function auditRow(i: number, extra: Record<string, unknown> = {}) {
  return {
    table: "audit_log",
    row: { id: `a${String(i).padStart(4, "0")}`, created_at: T0 + i * 1000, actor_id: i % 2 ? "u1" : "u2", action: i % 3 ? "update" : "create", resource: "job", resource_id: `j${i}`, meta: { n: i }, ...extra },
  };
}

describe("auth", () => {
  it("answers /health without a signature", async () => {
    expect(await call(testEnv(), new Request(`${BASE}/health`))).toEqual({ status: 200, body: { ok: true } });
  });

  it("refuses unsigned, wrongly signed, stale and tampered requests", async () => {
    const env = testEnv();
    expect((await call(env, new Request(`${BASE}/logs/audit_log`))).status).toBe(401);
    expect((await call(env, signed("GET", "/logs/audit_log", undefined, { secret: "x".repeat(40) }))).status).toBe(401);
    expect((await call(env, signed("GET", "/logs/audit_log", undefined, { at: Date.now() - MAX_SKEW_MS - 1000 }))).status).toBe(401);

    // Signed for one path, sent to another.
    const good = signed("GET", "/logs/audit_log?actor_id=u1");
    const moved = new Request(`${BASE}/logs/audit_log?actor_id=u2`, { headers: good.headers });
    expect((await call(env, moved)).status).toBe(401);

    // Body swapped after signing.
    const req = signed("POST", "/logs/batch", { rows: [auditRow(1)] });
    const swapped = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ rows: [auditRow(2)] }) });
    expect((await call(env, swapped)).status).toBe(401);
  });

  it("refuses everything while the Worker has no (or a short) secret", async () => {
    const req = signed("GET", "/logs/audit_log");
    expect(await verifyRequest(undefined, req, "")).toEqual({ ok: false, reason: "worker secret not configured" });
    expect(await verifyRequest("short", req, "")).toEqual({ ok: false, reason: "worker secret not configured" });
  });
});

describe("logs", () => {
  it("writes a batch and reads it back newest first, paged, with the total", async () => {
    const env = testEnv();
    const rows = Array.from({ length: 25 }, (_, i) => auditRow(i));
    expect(await call(env, signed("POST", "/logs/batch", { rows }))).toEqual({ status: 200, body: { written: 25, unmatched: [] } });

    const page = await call(env, signed("GET", "/logs/audit_log?page=2&pageSize=10"));
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
    const data = page.body.data as Array<Record<string, unknown>>;
    expect(data.map((r) => r.id)).toEqual(["a0014", "a0013", "a0012", "a0011", "a0010", "a0009", "a0008", "a0007", "a0006", "a0005"]);
    expect(data[0].meta).toEqual({ n: 14 });
  });

  it("filters by whitelisted columns (one value or a list) and a time range", async () => {
    const env = testEnv();
    await call(env, signed("POST", "/logs/batch", { rows: Array.from({ length: 12 }, (_, i) => auditRow(i)) }));
    const one = await call(env, signed("GET", "/logs/audit_log?actor_id=u1&pageSize=50"));
    expect(one.body.total).toBe(6);
    const list = await call(env, signed("GET", `/logs/audit_log?resource_id=j1,j2,j3&from=${T0 + 2000}&to=${T0 + 3001}`));
    expect((list.body.data as Array<{ id: string }>).map((r) => r.id)).toEqual(["a0003", "a0002"]);
  });

  it("counts by a whitelisted column", async () => {
    const env = testEnv();
    await call(env, signed("POST", "/logs/batch", { rows: Array.from({ length: 12 }, (_, i) => auditRow(i)) }));
    const stats = await call(env, signed("GET", "/logs/audit_log/stats?groupBy=action"));
    expect(stats.body).toEqual({ groupBy: "action", groups: [{ value: "update", count: 8 }, { value: "create", count: 4 }] });
  });

  it("is idempotent, updates only mutable columns, and matches receipts by provider id", async () => {
    const env = testEnv();
    const wa = (status: string) => ({
      table: "whatsapp_log",
      row: { id: "w1", created_at: T0, sent_at: T0, to_number: "+971500000000", kind: "template", source: "notification", category: "jobs", status, wa_message_id: "wamid.1" },
    });
    await call(env, signed("POST", "/logs/batch", { rows: [wa("sent"), wa("sent")] }));
    await call(env, signed("POST", "/logs/batch", { rows: [{ table: "whatsapp_log", op: "update", where: { wa_message_id: "wamid.1" }, row: { status: "delivered", status_at: T0 + 5000 } }] }));
    const page = await call(env, signed("GET", "/logs/whatsapp_log"));
    expect(page.body.total).toBe(1);
    expect((page.body.data as Array<Record<string, unknown>>)[0]).toMatchObject({ status: "delivered", status_at: T0 + 5000 });

    // Re-sending an audit row never rewrites it (insert-once table).
    await call(env, signed("POST", "/logs/batch", { rows: [auditRow(1)] }));
    await call(env, signed("POST", "/logs/batch", { rows: [auditRow(1, { action: "tampered" })] }));
    const audit = await call(env, signed("GET", "/logs/audit_log"));
    expect((audit.body.data as Array<Record<string, unknown>>)[0].action).toBe("update");
  });

  it("reports updates that matched no row (a receipt that beat its insert) so the caller can retry", async () => {
    const env = testEnv();
    const res = await call(env, signed("POST", "/logs/batch", {
      rows: [
        auditRow(1),
        { table: "whatsapp_log", op: "update", where: { wa_message_id: "wamid.unknown" }, row: { status: "read" } },
      ],
    }));
    expect(res).toEqual({ status: 200, body: { written: 1, unmatched: [1] } });
  });

  it("stores booleans and reads them back as booleans", async () => {
    const env = testEnv();
    await call(env, signed("POST", "/logs/batch", {
      rows: [{ table: "consent_log", row: { id: "c1", created_at: T0, user_id: "u1", consent_type: "marketing", granted: false } }],
    }));
    const page = await call(env, signed("GET", "/logs/consent_log?user_id=u1"));
    expect((page.body.data as Array<Record<string, unknown>>)[0].granted).toBe(false);
  });

  it.each([
    [{ rows: [{ table: "users", row: {} }] }, "unknown table users"],
    [{ rows: [{ table: "audit_log", row: { id: "x; DROP TABLE audit_log", created_at: 1, action: "a", resource: "r" } }] }, "id must be"],
    [{ rows: [{ table: "audit_log", row: { id: "x", created_at: 1, action: "a" } }] }, "audit_log needs resource"],
    [{ rows: [{ table: "audit_log", row: { id: "x", created_at: 1, action: "a", resource: "r", "evil = 1; --": 1 } }] }, "has no column"],
    [{ rows: [{ table: "audit_log", row: { id: "x", created_at: "yesterday", action: "a", resource: "r" } }] }, "created_at"],
    [{ rows: [{ table: "email_log", op: "update", where: { to_address: "a@b.c" }, row: { status: "x" } }] }, "update needs exactly one of: id, message_id"],
    [{ rows: [{ table: "audit_log", op: "update", where: { id: "x" }, row: { action: "y" } }] }, "cannot update action"],
    [{ rows: [] }, "non-empty"],
    [{ rows: [{ table: "audit_log", row: { id: "x", created_at: 1, action: "a", resource: "r", constructor: null } }] }, "has no column constructor"],
  ])("refuses a bad write with a 400 (%#)", async (payload, message) => {
    const res = await call(testEnv(), signed("POST", "/logs/batch", payload));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain(message);
  });

  it("writes nothing when any row of the batch is bad", async () => {
    const env = testEnv();
    const res = await call(env, signed("POST", "/logs/batch", { rows: [auditRow(1), { table: "audit_log", row: { id: "bad" } }] }));
    expect(res.status).toBe(400);
    expect((await call(env, signed("GET", "/logs/audit_log"))).body.total).toBe(0);
  });

  it.each([
    ["/logs/audit_log?ip_address=1.2.3.4", "cannot filter by ip_address"],
    ["/logs/audit_log?pageSize=1000", "pageSize must be"],
    ["/logs/audit_log?page=100000&pageSize=100", "too deep"],
    ["/logs/audit_log?from=yesterday", "from must be"],
    ["/logs/audit_log/stats?groupBy=ip_address", "cannot group"],
    ["/logs/sqlite_master", "unknown table"],
    ["/logs/audit_log?actor_id=a&actor_id=b", "actor_id given twice"],
    [
      `/logs/whatsapp_log?${["user_id", "status", "wa_message_id", "broadcast_id", "schedule_id"]
        .map((k) => `${k}=${Array.from({ length: 20 }, (_, i) => `v${i}`).join(",")}`)
        .join("&")}`,
      "at most 90 filter values",
    ],
  ])("refuses a bad read %s", async (path, message) => {
    const res = await call(testEnv(), signed("GET", path));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain(message);
  });
});

describe("vectors", () => {
  const vector = (seed: number) => Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i));

  it("upserts with whitelisted metadata and queries ids only by default", async () => {
    const env = testEnv();
    const up = await call(env, signed("POST", "/vectors/upsert", {
      index: "jobs",
      vectors: [{ id: "65f0c0ffee0000000000aaaa", values: vector(1), metadata: { country: "AE", status: "active" } }],
    }));
    expect(up).toEqual({ status: 200, body: { upserted: 1 } });
    expect(env.VEC_JOBS.upserted[0].metadata).toEqual({ country: "AE", status: "active" });

    const q = await call(env, signed("POST", "/vectors/query", { index: "jobs", vector: vector(2), topK: 100, filter: { country: "AE", status: { $in: ["active"] } } }));
    expect(q.body).toEqual({ matches: [{ id: "65f0c0ffee0000000000aaaa", score: 0.91 }] });
    expect(env.VEC_JOBS.queries[0].options).toMatchObject({ topK: 100, returnMetadata: "none", returnValues: false });
  });

  it.each([
    [{ index: "users", vectors: [] }, "/vectors/upsert", "unknown index"],
    [{ index: "jobs", vectors: [{ id: "a", values: [1, 2, 3] }] }, "/vectors/upsert", "1024 numbers"],
    [{ index: "jobs", vectors: [{ id: "a", values: Array(1024).fill(0), metadata: { salary: 1 } }] }, "/vectors/upsert", "unknown metadata field salary"],
    [{ index: "jobs", vectors: [{ id: "x".repeat(65), values: Array(1024).fill(0) }] }, "/vectors/upsert", "1-64 bytes"],
    [{ index: "jobs", vector: Array(1024).fill(0), topK: 101 }, "/vectors/query", "topK must be 1-100"],
    [{ index: "jobs", vector: Array(1024).fill(0), topK: 60, returnMetadata: true }, "/vectors/query", "topK must be 1-50"],
    [{ index: "jobs", vector: Array(1024).fill(0), filter: { country: { $regex: "A" } } }, "/vectors/query", "unsupported filter operator"],
    [{ index: "jobs" }, "/vectors/query", "exactly one of vector or id"],
    [{ index: "jobs", ids: [] }, "/vectors/delete", "ids must hold"],
    [{ index: "jobs", vectors: Array.from({ length: 101 }, (_, i) => ({ id: `v${i}`, values: [0] })) }, "/vectors/upsert", "1-50 items"],
  ])("refuses a bad vector call with a 400 (%#)", async (payload, path, message) => {
    const res = await call(testEnv(), signed("POST", path, payload));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain(message);
  });

  it("takes a full batch of real-precision 1024-d vectors within the body cap", async () => {
    const env = testEnv();
    const vectors = Array.from({ length: 50 }, (_, n) => ({
      id: "0123456789abcdef01234".concat(String(n).padStart(3, "0")),
      values: Array.from({ length: 1024 }, (_, i) => -Math.abs(Math.sin(n * 1024 + i)) / 7),
    }));
    const req = signed("POST", "/vectors/upsert", { index: "seekers", vectors });
    expect((await req.clone().text()).length).toBeLessThan(2 * 1024 * 1024);
    expect(await call(env, req)).toEqual({ status: 200, body: { upserted: 50 } });
  });

  it("deletes by id", async () => {
    const env = testEnv();
    await call(env, signed("POST", "/vectors/delete", { index: "seekers", ids: ["a", "b"] }));
    expect(env.VEC_SEEKERS.deleted).toEqual(["a", "b"]);
  });
});

describe("errors", () => {
  it("hides internal errors behind a generic 500", async () => {
    const env = testEnv();
    env.DB_LOGS.batch = async () => {
      throw new Error("D1_ERROR: secret internals");
    };
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call(env, signed("POST", "/logs/batch", { rows: [auditRow(1)] }));
    spy.mockRestore();
    expect(res).toEqual({ status: 500, body: { error: "internal error" } });
  });

  it("404s unknown routes and refuses oversized bodies", async () => {
    expect((await call(testEnv(), signed("GET", "/nope"))).status).toBe(404);
    const big = signed("POST", "/logs/batch", { rows: [{ table: "audit_log", row: { pad: "x".repeat(2 * 1024 * 1024) } }] });
    expect((await call(testEnv(), big)).status).toBe(413);
  });
});

describe("guarded updates", () => {
  function waRow(id: string, status: string) {
    return {
      table: "whatsapp_log",
      row: { id, created_at: T0, sent_at: T0, to_number: "+447700900001", wa_message_id: `wamid.${id}`, kind: "template", source: "notification", category: "jobs", status },
    };
  }

  it("moves status forward only, as the Mongo receipt handler does", async () => {
    const env = testEnv();
    await call(env, signed("POST", "/logs/batch", { rows: [waRow("w1", "sent")] }));
    const receipt = (status: string, lower: string[]) => ({
      table: "whatsapp_log",
      op: "update",
      where: { wa_message_id: "wamid.w1" },
      row: { status, status_at: T0 + 1 },
      onlyIf: { status: lower },
    });
    expect((await call(env, signed("POST", "/logs/batch", { rows: [receipt("read", ["sent", "delivered"])] }))).body).toEqual({ written: 1, unmatched: [] });
    // A late "delivered" finds no row still below it: nothing changes.
    expect((await call(env, signed("POST", "/logs/batch", { rows: [receipt("delivered", ["sent"])] }))).body).toEqual({ written: 0, unmatched: [0] });
    expect(env.DB_LOGS.raw.prepare("SELECT status FROM whatsapp_log").get()).toEqual({ status: "read" });
  });

  it("refuses a guard on a column that is not mutable, or with no values", async () => {
    const env = testEnv();
    const bad = (onlyIf: unknown) =>
      call(env, signed("POST", "/logs/batch", { rows: [{ table: "whatsapp_log", op: "update", where: { wa_message_id: "x" }, row: { status: "read" }, onlyIf }] }));
    expect((await bad({ to_number: ["+1"] })).status).toBe(400);
    expect((await bad({ status: [] })).status).toBe(400);
    expect((await bad({ status: ["a"], status_at: [1] })).status).toBe(400);
  });
});

describe("POST /logs/erase", () => {
  it("deletes WhatsApp rows by account or number, and only those", async () => {
    const env = testEnv();
    const wa = (id: string, user: string | null, to: string) => ({
      table: "whatsapp_log",
      row: { id, created_at: T0, sent_at: T0, user_id: user, to_number: to, kind: "text", source: "notification", category: "jobs", status: "sent" },
    });
    await call(env, signed("POST", "/logs/batch", { rows: [wa("a", "u1", "+1"), wa("b", null, "+1"), wa("c", "u2", "+2"), wa("d", null, "+9")] }));
    expect((await call(env, signed("POST", "/logs/erase", { table: "whatsapp_log", by: "to_number", values: ["+1", "+2"] }))).body).toEqual({ changed: 3 });
    expect((await call(env, signed("POST", "/logs/erase", { table: "whatsapp_log", by: "user_id", values: ["u1"] }))).body).toEqual({ changed: 0 });
    expect(env.DB_LOGS.raw.prepare("SELECT id FROM whatsapp_log").all()).toEqual([{ id: "d" }]);
  });

  it("redacts consent rows, keeping the choice as evidence", async () => {
    const env = testEnv();
    const consent = (id: string, user: string) => ({
      table: "consent_log",
      row: { id, created_at: T0, user_id: user, user_name: "Ada", consent_type: "marketing", granted: true, ip_address: "203.0.113.9" },
    });
    await call(env, signed("POST", "/logs/batch", { rows: [consent("c1", "u1"), consent("c2", "u2")] }));
    expect((await call(env, signed("POST", "/logs/erase", { table: "consent_log", by: "user_id", values: ["u1"] }))).body).toEqual({ changed: 1 });
    expect(env.DB_LOGS.raw.prepare("SELECT id, user_name, ip_address, granted FROM consent_log ORDER BY id").all()).toEqual([
      { id: "c1", user_name: "Deleted User", ip_address: null, granted: 1 },
      { id: "c2", user_name: "Ada", ip_address: "203.0.113.9", granted: 1 },
    ]);
  });

  it("refuses tables and columns the spec does not allow", async () => {
    const env = testEnv();
    const erase = (payload: unknown) => call(env, signed("POST", "/logs/erase", payload));
    expect((await erase({ table: "audit_log", by: "actor_id", values: ["u1"] })).status).toBe(400);
    expect((await erase({ table: "whatsapp_log", by: "status", values: ["sent"] })).status).toBe(400);
    expect((await erase({ table: "whatsapp_log", by: "user_id", values: [] })).status).toBe(400);
    expect((await erase({ table: "whatsapp_log", by: "user_id", values: Array.from({ length: 91 }, (_, i) => `u${i}`) })).status).toBe(400);
  });
});
