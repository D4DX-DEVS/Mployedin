/**
 * @jest-environment jsdom
 */
const fetchMock = jest.fn().mockResolvedValue({ ok: true });

beforeEach(() => {
  jest.resetModules();
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  document.cookie = "csrf-token=tok123; path=/";
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("sends a caught browser error to the server once, with the CSRF header", async () => {
  const { reportError } = await import("@/lib/observability/report-error");
  const err = new Error("render blew up");
  reportError(err, { source: "dashboard-boundary", digest: "d1" });
  reportError(err, { source: "dashboard-boundary", digest: "d1" }); // a re-render must not resend
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/client-errors");
  expect(init.method).toBe("POST");
  expect(init.keepalive).toBe(true);
  expect(init.headers["x-csrf-token"]).toBe("tok123");
  expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ message: "render blew up", source: "dashboard-boundary", digest: "d1" }));
});

it("never throws if the report itself fails", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const { reportError } = await import("@/lib/observability/report-error");
  expect(() => reportError(new Error("x"))).not.toThrow();
});
