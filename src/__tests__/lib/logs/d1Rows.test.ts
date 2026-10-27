/**
 * @jest-environment node
 *
 * Every mapped row must be one the Worker accepts: realistic Mongo documents of
 * each log collection go through toD1Row and then the Worker's real write path
 * on SQLite with the real migrations.
 */
import { Types } from "mongoose";
import { toD1Row } from "@/lib/logs/d1Rows";
import type { LogTable } from "@/lib/cloudflare/dataWorkerClient";
import { TABLES } from "../../../../workers/mployedin-data/src/tables";
import { writeLogs } from "../../../../workers/mployedin-data/src/logs";
import { testEnv } from "../../../../workers/mployedin-data/src/__tests__/testEnv";

const id = () => new Types.ObjectId();
const AT = new Date("2026-10-20T10:00:00.000Z");

const DOCS: Record<LogTable, Record<string, unknown>> = {
  audit_log: {
    _id: id(), actorId: id(), actorRole: "admin", onBehalfOfId: id(), onBehalfOfRole: "employer",
    action: "job.create", resource: "job", resourceId: "j1", changes: { after: { title: "Chef" } },
    meta: { via: "tenant_view" }, ipAddress: "203.0.113.1", country: "GB", userAgent: "UA", createdAt: AT,
  },
  consent_log: {
    _id: id(), userId: id(), userName: "Ada", consentType: "marketing", granted: false, source: "settings",
    policyVersion: "2026-09", receiptId: "8c1f7a8e-0000-4000-8000-000000000000", ipAddress: "203.0.113.2", createdAt: AT, updatedAt: AT,
  },
  email_log: {
    _id: id(), userId: "u1", to: "a@example.com", subject: "Hi", category: "jobs", status: "sent", messageId: "<m1@x>",
    source: "digest", metadata: { jobs: 3 }, sentAt: AT, createdAt: AT, updatedAt: AT,
  },
  whatsapp_log: {
    _id: id(), userId: "u1", to: "+447700900001", waMessageId: "wamid.1", kind: "template", templateName: "job_alert",
    templateLanguage: "en", source: "notification", category: "jobs", notificationType: "job_match", status: "failed",
    errorCode: 131026, errorKind: "undeliverable", errorMessage: "x", sentAt: AT, statusAt: AT, createdAt: AT,
  },
  activity_event: { _id: id(), jobSeekerId: id(), type: "job_match", metadata: { jobId: "j1" }, priority: 2, createdAt: AT },
  profile_view: { _id: id(), jobSeekerId: id(), viewerId: id(), viewerRole: "employer", source: "search", viewedAt: AT, notifiedAt: AT, createdAt: AT },
  company_profile_view: { _id: id(), viewerId: id(), employerId: id(), viewedAt: AT, createdAt: AT },
  resource_download: { _id: id(), resourceId: id(), userId: id(), fileKey: "resources/a.pdf", fileName: "a.pdf", downloadedAt: AT },
};

describe.each(Object.keys(DOCS) as LogTable[])("%s", (table) => {
  const row = toD1Row(table, DOCS[table])!;

  it("maps to the Worker's columns with the right JS types", () => {
    const spec = TABLES[table];
    for (const [column, value] of Object.entries(row)) {
      expect({ column, known: column in spec.columns }).toEqual({ column, known: true });
      const type = spec.columns[column];
      const expected = type === "int" ? "number" : type === "bool" ? "boolean" : type === "json" ? "object" : "string";
      expect({ column, type: typeof value }).toEqual({ column, type: expected });
    }
    expect(row.id).toBe(String(DOCS[table]._id));
  });

  it("is accepted by the Worker and stored once, however often it is written", async () => {
    const env = testEnv();
    await writeLogs(env, [{ table, row }]);
    await writeLogs(env, [{ table, row }]);
    expect(env.DB_LOGS.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 1 });
  });

  it("is skipped (null) when a required value is missing", () => {
    const required = TABLES[table].required[0];
    expect(required).toBeDefined();
    // Remove every Mongo field that feeds the required column.
    const broken = Object.fromEntries(
      Object.entries(DOCS[table]).filter(([key]) => toD1Row(table, { ...DOCS[table], [key]: undefined })?.[required] !== undefined),
    );
    expect(toD1Row(table, broken)).toBeNull();
  });
});

describe("toD1Row details", () => {
  it("stores dates as epoch ms and ObjectIds as hex", () => {
    const doc = DOCS.profile_view;
    expect(toD1Row("profile_view", doc)).toMatchObject({
      viewed_at: AT.getTime(),
      notified_at: AT.getTime(),
      job_seeker_id: String(doc.jobSeekerId),
    });
  });

  it("falls back to createdAt when the time field is absent (legacy rows)", () => {
    const { sentAt: _drop, ...doc } = DOCS.email_log;
    void _drop;
    expect(toD1Row("email_log", doc)).toMatchObject({ sent_at: AT.getTime(), created_at: AT.getTime() });
  });

  it("replaces JSON over the Worker's limit with a marker instead of losing the row", () => {
    const row = toD1Row("audit_log", { ...DOCS.audit_log, meta: { blob: "x".repeat(70_000) } })!;
    expect(row.meta).toEqual({ truncated: true, bytes: expect.any(Number) });
  });

  it("reads a hydrated document through toObject", () => {
    const hydrated = { toObject: () => DOCS.activity_event };
    expect(toD1Row("activity_event", hydrated)).toMatchObject({ type: "job_match", priority: 2 });
  });

  it("drops a non-integer error code rather than have the Worker refuse the row", () => {
    expect(toD1Row("whatsapp_log", { ...DOCS.whatsapp_log, errorCode: 1.5 })).not.toHaveProperty("error_code");
  });
});
