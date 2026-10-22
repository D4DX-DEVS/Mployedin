/**
 * @jest-environment node
 *
 * Every place the app signs a person out must first clear what the device
 * keeps for the next person (push subscription, drafts, chats, Firebase user).
 * The order matters: removing the push subscription is an authenticated
 * request, so it has to run before signOut() ends the session.
 *
 * Limit: sees named `import { signOut } from "next-auth/react"` only (not `import *` or aliases).
 *
 * A source-level guard, so a sign-out button added later cannot skip it. The
 * behaviour of the cleanup itself is covered in lib/consent/logoutCleanup.test.ts.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

// Client sign-outs: the ones that call signOut() from next-auth/react.
const clientSignOuts = sourceFiles(SRC).filter((file) => {
  const text = fs.readFileSync(file, "utf8");
  return /import\s*\{[^}]*\bsignOut\b[^}]*\}\s*from\s*["']next-auth\/react["']/.test(text);
});

describe("every client sign-out clears the device first", () => {
  it("finds the known sign-out sites (so the scan is not silently empty)", () => {
    const files = clientSignOuts.map(rel);
    expect(files).toEqual(
      expect.arrayContaining([
        "components/shared/UserProfileDropdown.tsx",
        "hooks/useIdleTimeout.ts",
        "components/features/auth/AcceptTermsForm.tsx",
        "app/[locale]/(auth)/verify-email/page.tsx",
        "app/[locale]/(auth)/verify-oauth-2fa/page.tsx",
        "app/[locale]/(dashboard)/employer/settings/page.tsx",
        "app/[locale]/(onboarding)/onboarding/page.tsx",
      ])
    );
  });

  it.each(clientSignOuts.map((file) => [rel(file), file]))("%s calls logoutCleanup() before each signOut()", (_name, file) => {
    const text = fs.readFileSync(file, "utf8");
    expect(text).toMatch(/import\s*\{[^}]*\blogoutCleanup\b[^}]*\}\s*from\s*["']@\/lib\/consent\/logoutCleanup["']/);

    const calls = [...text.matchAll(/\bsignOut\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const before = text.slice(Math.max(0, (call.index ?? 0) - 400), call.index);
      expect(before).toContain("logoutCleanup(");
    }
  });
});
