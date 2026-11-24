/**
 * @jest-environment node
 *
 * Admin staff performance report (plan v2): only admin may read a super
 * agent's or agent's report, its downloads, or the list signals.
 */
import { NextRequest } from "next/server";

let role = "admin";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string }, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, params?: Record<string, string>) => handler(req, { userId: "admin_1", role, locale: "en" }, params),
}));

const buildStaffReport = jest.fn();
jest.mock("@/lib/admin/staffReport/build.server", () => ({ buildStaffReport: (...a: unknown[]) => buildStaffReport(...a) }));
const staffListSignals = jest.fn();
jest.mock("@/lib/admin/staffReport/signals.server", () => ({ staffListSignals: (...a: unknown[]) => staffListSignals(...a) }));
jest.mock("@/lib/admin/staffReport/export.server", () => ({
  fileBase: () => "file",
  reportCsvZip: jest.fn(async () => Buffer.from("zip")),
  reportPdf: jest.fn(() => Buffer.from("%PDF")),
  reportTranslator: jest.fn(async () => (k: string) => k),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

import { GET as saReport } from "@/app/api/admin/super-agents/[id]/report/route";
import { GET as agentReport } from "@/app/api/admin/agents/[id]/report/route";
import { GET as agentDownload } from "@/app/api/admin/agents/[id]/report/download/route";
import { GET as signals } from "@/app/api/admin/staff-signals/route";

type RouteFn = (req: NextRequest, params?: Record<string, string>) => Promise<Response>;
const call = (fn: unknown, url: string, params?: Record<string, string>) => (fn as RouteFn)(new NextRequest(url), params);
const ID = "64b7f0c2a1b2c3d4e5f60718";

beforeEach(() => {
  role = "admin";
  buildStaffReport.mockReset();
  staffListSignals.mockReset();
});

describe("staff report access", () => {
  it.each(["super_agent", "agent", "employer", "job_seeker"])("refuses %s", async (r) => {
    role = r;
    expect((await call(saReport, `http://x/api/admin/super-agents/${ID}/report`, { id: ID })).status).toBe(403);
    expect((await call(agentReport, `http://x/api/admin/agents/${ID}/report`, { id: ID })).status).toBe(403);
    expect((await call(agentDownload, `http://x/api/admin/agents/${ID}/report/download?format=pdf`, { id: ID })).status).toBe(403);
    expect((await call(signals, "http://x/api/admin/staff-signals?role=agent&ids=" + ID)).status).toBe(403);
    expect(buildStaffReport).not.toHaveBeenCalled();
    expect(staffListSignals).not.toHaveBeenCalled();
  });

  it("rejects a malformed id and returns 404 for an unknown person", async () => {
    expect((await call(saReport, "http://x/r", { id: "nope" })).status).toBe(400);
    buildStaffReport.mockResolvedValue(null);
    expect((await call(saReport, "http://x/r", { id: ID })).status).toBe(404);
  });

  it("passes the role and the parsed range to the builder", async () => {
    buildStaffReport.mockResolvedValue({ kind: "super_agent" });
    const res = await call(saReport, `http://x/r?range=custom&from=2026-02-01&to=2026-03-01&locale=ar`, { id: ID });
    expect(res.status).toBe(200);
    expect(buildStaffReport).toHaveBeenCalledWith("super_agent", ID, { preset: "custom", from: "2026-02-01", to: "2026-03-01" }, "ar");
  });

  it("serves a PDF and a zip, and rejects any other format", async () => {
    buildStaffReport.mockResolvedValue({ kind: "agent" });
    const pdf = await call(agentDownload, "http://x/d?format=pdf", { id: ID });
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const zip = await call(agentDownload, "http://x/d?format=csv", { id: ID });
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect((await call(agentDownload, "http://x/d?format=xls", { id: ID })).status).toBe(400);
  });

  it("signals: needs a valid role and caps ids at 100", async () => {
    expect((await call(signals, "http://x/s?role=employer&ids=a")).status).toBe(400);
    staffListSignals.mockResolvedValue([]);
    const ids = Array.from({ length: 150 }, (_, i) => `id${i}`).join(",");
    await call(signals, `http://x/s?role=super_agent&ids=${ids}`);
    expect(staffListSignals.mock.calls[0][1]).toHaveLength(100);
  });
});
