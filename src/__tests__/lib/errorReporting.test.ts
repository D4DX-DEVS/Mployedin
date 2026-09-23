/**
 * @jest-environment node
 *
 * 2026-09-23 audit: browser crashes caught by the error boundaries were only
 * console.error'd in the user's own browser, so nobody running the platform
 * ever saw them, and nothing alerted on server errors either.
 */
import { NextRequest } from "next/server";

const logError = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logError(...a), warn: jest.fn(), info: jest.fn() } }));
const checkRateLimit = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

const fetchMock = jest.fn().mockResolvedValue({ ok: true });
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.resetModules();
  logError.mockClear();
  fetchMock.mockClear();
  checkRateLimit.mockResolvedValue({ allowed: true });
  delete process.env.ERROR_ALERT_WEBHOOK_URL;
});

function post(body: unknown) {
  return new NextRequest("http://localhost/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/client-errors", () => {
  it("logs a browser error to the server log, truncated", async () => {
    const { POST } = await import("@/app/api/client-errors/route");
    const res = await POST(post({ message: "x".repeat(5000), stack: "at a\nat b", source: "dashboard-boundary", url: "/en/admin" }));
    expect(res.status).toBe(204);
    const [fields, msg] = logError.mock.calls[0];
    expect(msg).toBe("Client error");
    expect(fields.event).toBe("client_error");
    expect(fields.source).toBe("dashboard-boundary");
    expect(fields.message.length).toBeLessThanOrEqual(1000);
  });

  it("rejects a body without a message", async () => {
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post({ source: "x" }))).status).toBe(400);
    expect(logError).not.toHaveBeenCalled();
  });

  it("is rate limited per client", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import("@/app/api/client-errors/route");
    expect((await POST(post({ message: "boom" }))).status).toBe(429);
    expect(logError).not.toHaveBeenCalled();
  });
});

describe("sendErrorAlert", () => {
  it("does nothing without a webhook configured", async () => {
    const { sendErrorAlert } = await import("@/lib/observability/alert");
    await sendErrorAlert("sig", "boom");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts once per error signature per minute", async () => {
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    const { sendErrorAlert } = await import("@/lib/observability/alert");
    await sendErrorAlert("GET /api/jobs TypeError", "first");
    await sendErrorAlert("GET /api/jobs TypeError", "again");
    await sendErrorAlert("POST /api/offers Error", "other");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/abc");
    expect(JSON.parse(init.body)).toEqual({ text: "first" });
  });

  it("caps total alerts per minute, so varying the text can't flood the channel", async () => {
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    const { sendErrorAlert } = await import("@/lib/observability/alert");
    for (let i = 0; i < 50; i++) await sendErrorAlert(`client:x:message ${i}`, `message ${i}`);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("escapes Slack control sequences so reported text can't @channel", async () => {
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    const { sendErrorAlert } = await import("@/lib/observability/alert");
    await sendErrorAlert("sig", "<!channel> see <https://evil.example|here> & more");
    const { text } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<https://");
    expect(text).toBe("&lt;!channel&gt; see &lt;https://evil.example|here&gt; &amp; more");
  });

  it("never throws when the webhook is down", async () => {
    process.env.ERROR_ALERT_WEBHOOK_URL = "https://hooks.example.com/abc";
    fetchMock.mockRejectedValueOnce(new Error("down"));
    const { sendErrorAlert } = await import("@/lib/observability/alert");
    await expect(sendErrorAlert("s", "t")).resolves.toBeUndefined();
  });
});
