/**
 * @jest-environment node
 *
 * src/lib/images/providerAvatarHosts.mjs is the one home of the provider-avatar
 * host list, the dot-boundary host matcher, the 5 MB cap and the capped body
 * reader. The app (externalAvatar.ts, the proxy route) and the re-host script
 * all import it. The "no copies" tests keep it that way: a second copy of
 * security logic is a second place to forget a fix.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_AVATAR_BYTES,
  PROVIDER_AVATAR_HOSTS,
  isProviderAvatarHost,
  readCapped,
} from "@/lib/images/providerAvatarHosts.mjs";
import * as externalAvatar from "@/lib/images/externalAvatar";

const ROOT = path.resolve(__dirname, "../../..");

function source(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** A body that yields `total` bytes in 64 KB chunks and records whether it was cancelled. */
function chunkedBody(total: number, state: { cancelled: boolean; pulled: number }): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.length, total - sent);
      sent += size;
      state.pulled = sent;
      controller.enqueue(chunk.subarray(0, size));
    },
    cancel() {
      state.cancelled = true;
    },
  });
}

describe("provider avatar hosts", () => {
  it("lists Google and LinkedIn avatar hosts and nothing else", () => {
    expect([...PROVIDER_AVATAR_HOSTS].sort()).toEqual(["lh3.googleusercontent.com", "media.licdn.com"]);
  });

  it("matches the exact host or a dot-boundary subdomain, case-insensitively, never a suffix", () => {
    expect(isProviderAvatarHost("lh3.googleusercontent.com")).toBe(true);
    expect(isProviderAvatarHost("LH3.GoogleUserContent.com")).toBe(true);
    expect(isProviderAvatarHost("a.media.licdn.com")).toBe(true);
    expect(isProviderAvatarHost("googleusercontent.com")).toBe(false);
    expect(isProviderAvatarHost("xmedia.licdn.com")).toBe(false);
    expect(isProviderAvatarHost("media.licdn.com.evil.com")).toBe(false);
    expect(isProviderAvatarHost("lh3.googleusercontent.com@evil.com")).toBe(false);
    expect(isProviderAvatarHost("")).toBe(false);
  });

  it("is what externalAvatar.ts exports, not a second copy", () => {
    expect(externalAvatar.isProviderAvatarHost).toBe(isProviderAvatarHost);
    expect(externalAvatar.PROVIDER_AVATAR_HOSTS).toBe(PROVIDER_AVATAR_HOSTS);
  });
});

describe("readCapped", () => {
  it("caps at 5 MB", () => {
    expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024);
  });

  it("returns the bytes of a body under the cap", async () => {
    const bytes = await readCapped(new Response(new Uint8Array([1, 2, 3])));
    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
  });

  it("returns an empty array for an empty or missing body", async () => {
    expect((await readCapped(new Response(new Uint8Array(0))))?.byteLength).toBe(0);
    expect((await readCapped(new Response(null)))?.byteLength).toBe(0);
  });

  it("refuses a declared size over the cap without reading the body", async () => {
    const state = { cancelled: false, pulled: 0 };
    const response = new Response(chunkedBody(MAX_AVATAR_BYTES * 4, state), {
      headers: { "content-length": String(MAX_AVATAR_BYTES + 1) },
    });
    expect(await readCapped(response)).toBeNull();
    expect(state.pulled).toBeLessThanOrEqual(64 * 1024 * 2);
  });

  it("stops reading a body that is bigger than it said, and cancels the stream", async () => {
    const state = { cancelled: false, pulled: 0 };
    const response = new Response(chunkedBody(MAX_AVATAR_BYTES * 10, state), { headers: { "content-length": "1000" } });
    expect(await readCapped(response)).toBeNull();
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(MAX_AVATAR_BYTES + 256 * 1024);
  });

  it("stops reading a body with no Content-Length at all", async () => {
    const state = { cancelled: false, pulled: 0 };
    expect(await readCapped(new Response(chunkedBody(MAX_AVATAR_BYTES * 10, state)))).toBeNull();
    expect(state.cancelled).toBe(true);
  });

  it("serves a body of exactly the cap", async () => {
    const state = { cancelled: false, pulled: 0 };
    const bytes = await readCapped(new Response(chunkedBody(MAX_AVATAR_BYTES, state)));
    expect(bytes?.byteLength).toBe(MAX_AVATAR_BYTES);
  });

  it("takes a smaller cap from the caller", async () => {
    const response = new Response(new Uint8Array(2048).fill(1), { headers: { "content-length": "10" } });
    expect(await readCapped(response, 1000)).toBeNull();
  });
});

describe("one copy of the security logic", () => {
  it("the proxy route reads upstream through the shared readCapped and has no reader loop or size cap of its own", () => {
    const route = source("src/app/api/proxy-image/route.ts");
    expect(route).toMatch(/from "@\/lib\/images\/providerAvatarHosts\.mjs"/);
    expect(route).not.toMatch(/getReader\(/);
    expect(route).not.toMatch(/5 \* 1024 \* 1024/);
  });

  it("externalAvatar.ts has no host names and no suffix matching of its own", () => {
    const file = source("src/lib/images/externalAvatar.ts");
    expect(file).toMatch(/from "\.\/providerAvatarHosts\.mjs"/);
    expect(file).not.toMatch(/googleusercontent|licdn/);
    expect(file).not.toMatch(/endsWith\(/);
  });

  it("the script core imports the shared module and has no host list, matcher or reader loop of its own", () => {
    const core = source("scripts/lib/rehostProviderAvatarsCore.mjs");
    expect(core).toMatch(/from "\.\.\/\.\.\/src\/lib\/images\/providerAvatarHosts\.mjs"/);
    expect(core).not.toMatch(/googleusercontent|licdn/);
    expect(core).not.toMatch(/endsWith\(/);
    expect(core).not.toMatch(/getReader\(/);
    expect(core).not.toMatch(/5 \* 1024 \* 1024/);
  });

  it("the shared module is plain ESM with no import, so Node resolves it outside Next", () => {
    const shared = source("src/lib/images/providerAvatarHosts.mjs");
    expect(shared).not.toMatch(/^\s*import\s/m);
    expect(shared).not.toMatch(/@\//);
  });

  it("the script core loads in plain Node (no Next, no alias, no database)", () => {
    const core = pathToFileURL(path.join(ROOT, "scripts/lib/rehostProviderAvatarsCore.mjs")).href;
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `const m = await import(${JSON.stringify(core)}); console.log(typeof m.rehostUser, m.isProviderAvatarUrl("https://media.licdn.com/x"));`],
      { cwd: os.tmpdir(), encoding: "utf8" },
    );
    expect(out.trim()).toBe("function true");
  });

  it("the CLI answers --help in plain Node without touching a database", () => {
    const script = path.join(ROOT, "scripts/rehost-provider-avatars.mjs");
    // cwd = the temp dir so dotenv finds no .env; MONGODB_URI is not set either.
    const env = { ...process.env };
    delete env.MONGODB_URI;
    const out = execFileSync(process.execPath, [script, "--help"], { cwd: os.tmpdir(), encoding: "utf8", env });
    expect(out).toMatch(/Usage: node scripts\/rehost-provider-avatars\.mjs/);
  });
});
