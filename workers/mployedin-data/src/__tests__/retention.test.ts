/**
 * @jest-environment node
 */
import { gunzipSync } from "zlib";
import { ARCHIVE_CHUNK, archiveTable, rebuildRollups, runNightly } from "../retention";
import { writeLogs } from "../logs";
import { testEnv } from "./testEnv";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 26, 2, 30);

function waRow(id: string, sentAt: number) {
  return {
    table: "whatsapp_log",
    row: { id, created_at: sentAt, sent_at: sentAt, to_number: `+44${id}`, kind: "text", category: "jobs", status: "sent", source: "notification" },
  };
}

function emailRow(id: string, sentAt: number) {
  return {
    table: "email_log",
    row: { id, created_at: sentAt, sent_at: sentAt, to_address: "a@b.c", category: "jobs", status: "sent", source: "digest" },
  };
}

describe("archiveTable", () => {
  it("moves rows past retention to R2 as gzipped NDJSON and deletes exactly those", async () => {
    const env = testEnv();
    await writeLogs(env, [
      waRow("old1", NOW - 400 * DAY),
      waRow("old2", NOW - 366 * DAY),
      waRow("new1", NOW - 364 * DAY),
    ]);

    const report = await archiveTable(env, "whatsapp_log", NOW);
    expect(report).toEqual({ table: "whatsapp_log", archived: 2, files: 1, chunks: 1, more: false });

    const [file] = env.archived;
    expect(file.key).toBe("log-archive/whatsapp_log/2025/09/21/old1--old2.ndjson.gz");
    expect(file).toMatchObject({ contentType: "application/x-ndjson", contentEncoding: "gzip" });
    const lines = gunzipSync(Buffer.from(file.body)).toString("utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id)).toEqual(["old1", "old2"]);
    expect(lines[0].to_number).toBe("+44old1");

    const left = env.DB_LOGS.raw.prepare("SELECT id FROM whatsapp_log").all() as Array<{ id: string }>;
    expect(left.map((r) => r.id)).toEqual(["new1"]);
  });

  it("expires email rows after Mongo's 90-day TTL without copying them to R2", async () => {
    const env = testEnv();
    await writeLogs(env, [emailRow("e_old", NOW - 91 * DAY), emailRow("e_new", NOW - 89 * DAY)]);
    expect(await archiveTable(env, "email_log", NOW)).toEqual({ table: "email_log", archived: 1, files: 0, chunks: 1, more: false });
    expect(env.archived).toEqual([]);
    expect(env.DB_LOGS.raw.prepare("SELECT id FROM email_log").all()).toEqual([{ id: "e_new" }]);
  });

  it("archives in chunks and deletes with under 100 bound ids per statement", async () => {
    const env = testEnv();
    const rows = Array.from({ length: ARCHIVE_CHUNK + 150 }, (_, i) => waRow(`r${String(i).padStart(5, "0")}`, NOW - 500 * DAY + i));
    for (let i = 0; i < rows.length; i += 500) await writeLogs(env, rows.slice(i, i + 500));

    const report = await archiveTable(env, "whatsapp_log", NOW);
    expect(report).toMatchObject({ archived: ARCHIVE_CHUNK + 150, files: 2, more: false });
    expect(env.DB_LOGS.raw.prepare("SELECT COUNT(*) AS n FROM whatsapp_log").get()).toEqual({ n: 0 });
    // The fake D1 throws above 100 bound parameters, as D1 does; reaching here proves the grouping.
  });

  it("stops at its chunk budget and reports more to do", async () => {
    const env = testEnv();
    const rows = Array.from({ length: ARCHIVE_CHUNK + 10 }, (_, i) => waRow(`b${String(i).padStart(5, "0")}`, NOW - 500 * DAY + i));
    for (let i = 0; i < rows.length; i += 500) await writeLogs(env, rows.slice(i, i + 500));
    expect(await archiveTable(env, "whatsapp_log", NOW, 1)).toMatchObject({ archived: ARCHIVE_CHUNK, files: 1, more: true });
    expect(env.DB_LOGS.raw.prepare("SELECT COUNT(*) AS n FROM whatsapp_log").get()).toEqual({ n: 10 });
  });

  it("keeps a row whose archive upload failed", async () => {
    const env = testEnv();
    await writeLogs(env, [waRow("old1", NOW - 400 * DAY)]);
    env.ARCHIVE.put = async () => {
      throw new Error("R2 down");
    };
    await expect(archiveTable(env, "whatsapp_log", NOW)).rejects.toThrow("R2 down");
    expect(env.DB_LOGS.raw.prepare("SELECT COUNT(*) AS n FROM whatsapp_log").get()).toEqual({ n: 1 });
  });

  it("honours the RETENTION_DAYS override", async () => {
    const env = testEnv();
    env.RETENTION_DAYS = '{"whatsapp_log": 30}';
    await writeLogs(env, [waRow("m1", NOW - 31 * DAY)]);
    expect((await archiveTable(env, "whatsapp_log", NOW)).archived).toBe(1);
  });
});

describe("rollups", () => {
  it("rebuilds daily profile views from raw rows, replacing only the rebuilt days", async () => {
    const env = testEnv();
    const view = (id: string, seeker: string, at: number) => ({
      table: "profile_view",
      row: { id, created_at: at, viewed_at: at, job_seeker_id: seeker, viewer_id: "e1", viewer_role: "employer" },
    });
    const day1 = Date.UTC(2026, 9, 24, 10);
    const day2 = Date.UTC(2026, 9, 25, 23, 59);
    await writeLogs(env, [view("v1", "s1", day1), view("v2", "s1", day1 + 1000), view("v3", "s1", day2), view("v4", "s2", day2)]);
    env.DB_LOGS.raw.exec("INSERT INTO profile_view_daily VALUES ('s9', '2026-01-01', 7)");

    expect(await rebuildRollups(env, day1)).toEqual({ since: "2026-10-24" });
    const days = env.DB_LOGS.raw.prepare("SELECT * FROM profile_view_daily ORDER BY job_seeker_id, day").all();
    expect(days).toEqual([
      { job_seeker_id: "s1", day: "2026-10-24", views: 2 },
      { job_seeker_id: "s1", day: "2026-10-25", views: 1 },
      { job_seeker_id: "s2", day: "2026-10-25", views: 1 },
      { job_seeker_id: "s9", day: "2026-01-01", views: 7 },
    ]);
    // Idempotent.
    await rebuildRollups(env, day1);
    expect(env.DB_LOGS.raw.prepare("SELECT SUM(views) AS n FROM profile_view_daily").get()).toEqual({ n: 11 });
  });
});

describe("rebuildRollups clamp", () => {
  it("never deletes rollups for days whose raw views were already archived", async () => {
    const env = testEnv();
    env.DB_LOGS.raw.exec("INSERT INTO profile_view_daily VALUES ('s1', '2024-01-01', 9)");
    const { since } = await rebuildRollups(env, Date.UTC(2024, 0, 1), NOW);
    // profile_view keeps 395 days: the first whole day still in D1 is 2025-09-27.
    expect(since).toBe("2025-09-27");
    expect(env.DB_LOGS.raw.prepare("SELECT views FROM profile_view_daily WHERE day = '2024-01-01'").get()).toEqual({ views: 9 });
  });
});

describe("runNightly", () => {
  it("visits every table and rebuilds the last three days of rollups", async () => {
    const report = await runNightly(testEnv(), NOW);
    expect(report.archive.map((r) => r.table)).toEqual([
      "audit_log", "consent_log", "email_log", "whatsapp_log", "activity_event", "profile_view", "company_profile_view", "resource_download",
    ]);
    expect(report.rollupsSince).toBe("2026-10-24");
  });
});
