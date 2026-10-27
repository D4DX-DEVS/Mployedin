/**
 * @jest-environment node
 *
 * Everything outside the storage module that has to know about R2: CDN image
 * URLs, the image-src helpers, the CSP, the image-proxy host pin and boot-time
 * env validation. Each must be unchanged while R2 is not configured.
 */
import { cdnImageUrl } from "@/lib/images/cdnImage";
import { toPublicImageSrc, toSafeImageSrc } from "@/lib/images/externalAvatar";
import { ownStorageHosts } from "@/lib/storage/storageHosts";
import { collectEnvErrors, collectEnvWarnings } from "@/lib/env";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const AVATAR = "https://cdn.mployedin.com/avatars/abc.jpg";

describe("R2 wiring", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  describe("CDN image URLs", () => {
    it("are left alone until transformations are switched on", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
      expect(cdnImageUrl(AVATAR, { width: 100 })).toBe(AVATAR);
      process.env.NEXT_PUBLIC_IMAGE_TRANSFORMS = "cloudflare";
      delete process.env.NEXT_PUBLIC_R2_PUBLIC_HOST;
      expect(cdnImageUrl(AVATAR, { width: 100 })).toBe(AVATAR);
    });

    it("resize on our host only, snapping the width to the fixed set", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
      process.env.NEXT_PUBLIC_IMAGE_TRANSFORMS = "cloudflare";
      expect(cdnImageUrl(AVATAR, { width: 100 })).toBe(
        "https://cdn.mployedin.com/cdn-cgi/image/width=128,format=auto,metadata=none,fit=scale-down,quality=80,onerror=redirect/avatars/abc.jpg",
      );
      expect(cdnImageUrl(AVATAR, { width: 5000 })).toContain("width=1920,");
      expect(cdnImageUrl(AVATAR)).not.toContain("width=");
      expect(cdnImageUrl("https://other.example/a.jpg", { width: 100 })).toBe("https://other.example/a.jpg");
      expect(cdnImageUrl("/icons/a.png")).toBe("/icons/a.png");
      // Never wraps a transformation URL twice.
      const once = cdnImageUrl(AVATAR, { width: 64 });
      expect(cdnImageUrl(once, { width: 64 })).toBe(once);
    });

    it("flow through the image-src helpers, except where a consumer opts out (the CV PDF)", () => {
      process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
      process.env.NEXT_PUBLIC_IMAGE_TRANSFORMS = "cloudflare";
      expect(toSafeImageSrc(AVATAR, { width: 256 })).toContain("/cdn-cgi/image/width=256,");
      expect(toSafeImageSrc(AVATAR, { transform: false })).toBe(AVATAR);
      expect(toPublicImageSrc(AVATAR)).toContain("/cdn-cgi/image/format=auto,");
      // Provider photos still go through our proxy.
      expect(toSafeImageSrc("https://lh3.googleusercontent.com/a/x")).toMatch(/^\/api\/proxy-image\?url=/);
    });
  });

  it("public pages load R2 images once the host is configured, and not before", () => {
    process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST = "d4dx-storage.blr1.cdn.digitaloceanspaces.com";
    expect(toPublicImageSrc(AVATAR)).toBeUndefined();
    process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
    expect(toPublicImageSrc(AVATAR)).toBe(AVATAR);
  });

  it("the image proxy accepts the R2 public host alongside Spaces", () => {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_HOST;
    expect([...ownStorageHosts()]).not.toContain("cdn.mployedin.com");
    process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
    expect(ownStorageHosts().has("cdn.mployedin.com")).toBe(true);
    process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST = "pinned.example";
    expect([...ownStorageHosts()].sort()).toEqual(["cdn.mployedin.com", "pinned.example"]);
  });

  it("the CSP gains exactly the two R2 origins in each storage directive, only when configured", async () => {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_HOST;
    delete process.env.R2_ACCOUNT_ID;
    const before = (await import("@/lib/security/headers")).getSecurityHeaders("n")["Content-Security-Policy"];
    expect(before).not.toContain("r2.cloudflarestorage.com");

    jest.resetModules();
    process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
    process.env.R2_ACCOUNT_ID = ACCOUNT;
    const mod = await import("@/lib/security/headers");
    const r2 = ` https://cdn.mployedin.com https://${ACCOUNT}.r2.cloudflarestorage.com`;
    for (const policy of [mod.getSecurityHeaders("n")["Content-Security-Policy"], mod.SECURITY_HEADERS["Content-Security-Policy"]]) {
      for (const directive of ["img-src", "connect-src", "frame-src", "object-src"]) {
        const value = policy.split("; ").find((d) => d.startsWith(directive))!;
        expect(value).toContain(r2.trim());
      }
    }
    // Removing the R2 origins gives back the Spaces-only policy.
    expect(mod.getSecurityHeaders("n")["Content-Security-Policy"].split(r2).join("")).toBe(before);
  });

  describe("boot-time env validation", () => {
    const base = {
      MONGODB_URI: "mongodb://x",
      NEXTAUTH_SECRET: "x".repeat(32),
      ENCRYPTION_KEY: "a".repeat(64),
      CRON_SECRET: "y".repeat(16),
    };

    it("needs every R2 value once STORAGE_PROVIDER=r2", () => {
      const errors = collectEnvErrors({ ...base, STORAGE_PROVIDER: "r2", R2_ACCOUNT_ID: "nope" });
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("R2_ACCESS_KEY_ID is missing"),
          expect.stringContaining("NEXT_PUBLIC_R2_PUBLIC_HOST / R2_PUBLIC_ENDPOINT is missing"),
          "R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) must be the 32-character hex account id from the Cloudflare dashboard",
        ]),
      );
      expect(
        collectEnvErrors({
          ...base,
          STORAGE_PROVIDER: "r2",
          R2_ACCOUNT_ID: ACCOUNT,
          R2_ACCESS_KEY_ID: "k",
          R2_SECRET_ACCESS_KEY: "s",
          R2_PUBLIC_BUCKET: "pub",
          R2_PRIVATE_BUCKET: "priv",
          NEXT_PUBLIC_R2_PUBLIC_HOST: "cdn.mployedin.com",
        }),
      ).toEqual([]);
    });

    it("accepts the Cloudflare dashboard names, with the private bucket defaulted", () => {
      expect(
        collectEnvErrors({
          ...base,
          STORAGE_PROVIDER: "r2",
          CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
          R2_ACCESS_KEY_ID: "k",
          R2_SECRET_ACCESS_KEY: "s",
          R2_BUCKET_NAME: "mployedin",
          R2_PUBLIC_ENDPOINT: "https://pub-abc123.r2.dev",
        }),
      ).toEqual([]);
    });

    it("asks nothing of R2 on Spaces, and warns when transforms are on without a host", () => {
      expect(collectEnvErrors(base)).toEqual([]);
      expect(collectEnvWarnings({ NEXT_PUBLIC_IMAGE_TRANSFORMS: "cloudflare" })).toEqual([
        "NEXT_PUBLIC_IMAGE_TRANSFORMS=cloudflare has no effect until NEXT_PUBLIC_R2_PUBLIC_HOST (or R2_PUBLIC_ENDPOINT) is set",
      ]);
      expect(collectEnvWarnings({ LOGS_STORE: "dual" })).toEqual([
        "LOGS_STORE=dual has no effect until DATA_WORKER_URL and DATA_WORKER_SECRET (32+ characters) are set: logs stay in MongoDB only",
      ]);
      expect(collectEnvWarnings({ LOGS_STORE: "dual", DATA_WORKER_URL: "https://d.example", DATA_WORKER_SECRET: "s".repeat(32) })).toEqual([]);
    });

    it("warns when the R2 public host was set after the build", () => {
      const runtime = { R2_PUBLIC_ENDPOINT: "https://pub-abc.r2.dev" };
      expect(collectEnvWarnings(runtime, "pub-abc.r2.dev")).toEqual([]);
      expect(collectEnvWarnings(runtime, undefined)).toEqual([
        "The R2 public host (pub-abc.r2.dev) differs from the one this build was made with (none): set NEXT_PUBLIC_R2_PUBLIC_HOST or R2_PUBLIC_ENDPOINT in the build environment and rebuild",
      ]);
      expect(collectEnvWarnings({}, undefined)).toEqual([]);
    });
  });
});
