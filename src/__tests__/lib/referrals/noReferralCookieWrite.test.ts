/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Guard for the PECR change "a referral code is not stored on arrival": no
 * source file may set the `mpl_ref` cookie. The one cookie that still carries
 * the code is `mpl_signup_consent`, written on the sign-up click
 * (lib/auth/signupConsent.ts). Reading a leftover `mpl_ref` for one release
 * (api/auth/post-login-redirect) and clearing it is allowed.
 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("no mpl_ref cookie is written", () => {
  const files = sourceFiles(SRC);

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no client code assigns document.cookie with the referral cookie name", () => {
    const offenders = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return /document\.cookie\s*=\s*[`"'][^`"']*(mpl_ref|\$\{REFERRAL_COOKIE_NAME\})/.test(text);
    });
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("the name mpl_ref appears in no source file except url.ts and the post-login-redirect route", () => {
    const allowed = new Set(["src/lib/referrals/url.ts", "src/app/api/auth/post-login-redirect/route.ts"]);
    const offenders = files
      .map((file) => relative(process.cwd(), file).replace(/\\/g, "/"))
      .filter((file) => !allowed.has(file))
      .filter((file) => readFileSync(join(process.cwd(), file), "utf8").includes("mpl_ref"));
    // Covers server code too: no cookies.set("mpl_ref", ...), no Set-Cookie header, no quoted name.
    expect(offenders).toEqual([]);
  });

  it("the only code that touches REFERRAL_COOKIE_NAME is the post-login-redirect legacy read and clear", () => {
    const users = files
      .filter((file) => file.replace(/\\/g, "/").endsWith("lib/referrals/url.ts") === false)
      .filter((file) => readFileSync(file, "utf8").includes("REFERRAL_COOKIE_NAME"))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, "/"));
    expect(users).toEqual(["src/app/api/auth/post-login-redirect/route.ts"]);
  });

  it("the post-login-redirect route only clears the legacy cookie, never sets a value", () => {
    const text = readFileSync(join(SRC, "app/api/auth/post-login-redirect/route.ts"), "utf8");
    const sets = text.match(/cookies\.set\(REFERRAL_COOKIE_NAME,[^)]*\)/g) ?? [];
    expect(sets.length).toBeGreaterThan(0);
    sets.forEach((call) => expect(call).toContain('""'));
    expect(text).toContain("ponytail:");
  });
});
