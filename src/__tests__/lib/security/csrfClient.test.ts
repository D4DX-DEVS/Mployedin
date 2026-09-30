/**
 * Google sign-in broke on prod once the (auth) layout mounted CsrfProvider:
 * the patched global fetch stamped `x-csrf-token` on Firebase's cross-origin
 * POSTs to identitytoolkit.googleapis.com, Google's preflight rejects that
 * header with a 403 and no CORS headers, and the browser reports it as CORS.
 * The token must only ever ride on requests to our own origin.
 */
describe("installCsrfFetch", () => {
  let originalFetch: jest.Mock;

  function sentHeaders(): Headers {
    const init = originalFetch.mock.calls[0][1] as RequestInit | undefined;
    return new Headers(init?.headers);
  }

  beforeEach(() => {
    jest.resetModules();
    document.cookie = "csrf-token=tok123";
    originalFetch = jest.fn().mockResolvedValue({ ok: true });
    window.fetch = originalFetch as unknown as typeof window.fetch;
     
    require("@/lib/security/csrf-client").installCsrfFetch();
  });

  it("adds the token to a same-origin relative POST", async () => {
    await window.fetch("/api/applications", { method: "POST" });
    expect(sentHeaders().get("x-csrf-token")).toBe("tok123");
  });

  it("adds the token to a same-origin absolute POST", async () => {
    await window.fetch(`${window.location.origin}/api/x`, { method: "PATCH" });
    expect(sentHeaders().get("x-csrf-token")).toBe("tok123");
  });

  it.each([
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=k",
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k",
    "https://securetoken.googleapis.com/v1/token?key=k",
  ])("leaves cross-origin POST %s untouched", async (url) => {
    const init = { method: "POST", headers: { "Content-Type": "application/json" } };
    await window.fetch(url, init);
    expect(sentHeaders().has("x-csrf-token")).toBe(false);
    expect(originalFetch.mock.calls[0][1]).toBe(init);
  });

  it("leaves a cross-origin URL object untouched", async () => {
    await window.fetch(new URL("https://api.example.com/hook"), { method: "POST" });
    expect(sentHeaders().has("x-csrf-token")).toBe(false);
  });

  it("does not add the token to GET", async () => {
    await window.fetch("/api/jobs");
    expect(sentHeaders().has("x-csrf-token")).toBe(false);
  });
});
