/**
 * getRecaptchaToken() — the client half of the invisible reCAPTCHA v3 gate.
 *
 * The site key is read at module load, so each case loads a fresh copy of the
 * module inside jest.isolateModules with the env it needs. The require must be
 * synchronous: isolateModules ends when its callback returns, and a dynamic
 * import() resolves after that, outside the isolated registry.
 */
export {};

type Mod = typeof import("@/lib/browser/recaptcha");

function loadWithSiteKey(siteKey: string | undefined): Mod {
  if (siteKey === undefined) delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  else process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = siteKey;
  let mod!: Mod;
  jest.isolateModules(() => {
     
    mod = require("@/lib/browser/recaptcha") as Mod;
  });
  return mod;
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  delete (window as unknown as { grecaptcha?: unknown }).grecaptcha;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});

describe("getRecaptchaToken", () => {
  test("no site key: disabled, resolves null, injects no script", async () => {
    const { getRecaptchaToken, isRecaptchaEnabled } = loadWithSiteKey(undefined);
    expect(isRecaptchaEnabled()).toBe(false);
    await expect(getRecaptchaToken("quick_apply")).resolves.toBeNull();
    expect(document.head.querySelector("script")).toBeNull();
  });

  test("site key set: loads the Google script once and executes with the action", async () => {
    const { getRecaptchaToken, isRecaptchaEnabled } = loadWithSiteKey("site-key-123");
    expect(isRecaptchaEnabled()).toBe(true);

    const execute = jest.fn().mockResolvedValue("tok-xyz");
    // Simulate the script finishing: define grecaptcha then fire onload.
    const observer = new MutationObserver(() => {
      const s = document.head.querySelector<HTMLScriptElement>("script[src*='recaptcha/api.js']");
      if (s && !(window as unknown as { grecaptcha?: unknown }).grecaptcha) {
        (window as unknown as { grecaptcha: unknown }).grecaptcha = { ready: (cb: () => void) => cb(), execute };
        s.onload?.(new Event("load"));
      }
    });
    observer.observe(document.head, { childList: true });

    const first = await getRecaptchaToken("quick_apply");
    const second = await getRecaptchaToken("quick_apply");
    observer.disconnect();

    expect(first).toBe("tok-xyz");
    expect(second).toBe("tok-xyz");
    const scripts = document.head.querySelectorAll("script[src*='recaptcha/api.js']");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("src")).toContain("render=site-key-123");
    expect(execute).toHaveBeenCalledWith("site-key-123", { action: "quick_apply" });
  });

  test("script fails to load: resolves null instead of throwing (server decides what a missing token means)", async () => {
    const { getRecaptchaToken } = loadWithSiteKey("site-key-123");
    const observer = new MutationObserver(() => {
      const s = document.head.querySelector<HTMLScriptElement>("script[src*='recaptcha/api.js']");
      s?.onerror?.(new Event("error"));
    });
    observer.observe(document.head, { childList: true });

    await expect(getRecaptchaToken("quick_apply")).resolves.toBeNull();
    observer.disconnect();
  });
});
