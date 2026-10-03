/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";
import { SECRET_MASK, SES_REGION_RE } from "@/lib/validators/settings";

const pageSource = () =>
  fs.readFileSync(path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)", "admin", "settings", "page.tsx"), "utf8");

// The admin settings page cannot import SECRET_MASK (the validators module pulls next/server into the
// client bundle), so it declares its own. If the two drift, a saved secret is sent back as if it were
// a new one and overwrites the stored key with the placeholder.
describe("admin settings page secret mask", () => {
  it("matches the server's SECRET_MASK", () => {
    const declared = pageSource().match(/const SECRET_MASK = "([^"]*)";/);
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(SECRET_MASK);
  });
});

// The same goes for the SES region pattern: the page declares a copy to flag a malformed region before
// Save. If the copy is looser than the server's, the page lets a region through that the server then
// refuses; if it is stricter, the page blocks a region the server would accept.
describe("admin settings page SES region pattern", () => {
  it("matches the server's SES_REGION_RE", () => {
    const declared = pageSource().match(/const SES_REGION_RE = \/(.+)\/([a-z]*);/);
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(SES_REGION_RE.source);
    expect(declared![2]).toBe(SES_REGION_RE.flags);
  });
});
