/**
 * @jest-environment node
 */
import {
  isOwnR2Address,
  r2ApiHost,
  r2CspOrigins,
  r2PrivateBucket,
  r2PublicBucket,
  r2PublicHost,
  r2UrlForKey,
  storageProvider,
} from "@/lib/storage/storageConfig";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

describe("storageConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to Spaces; only an explicit r2 switches", () => {
    expect(storageProvider({})).toBe("spaces");
    expect(storageProvider({ STORAGE_PROVIDER: "R2 " })).toBe("r2");
    expect(storageProvider({ STORAGE_PROVIDER: "cloudflare" })).toBe("spaces");
  });

  it("builds the API host from a 32-hex account id, with the jurisdiction when set", () => {
    expect(r2ApiHost({ R2_ACCOUNT_ID: ACCOUNT })).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(r2ApiHost({ R2_ACCOUNT_ID: ACCOUNT, R2_JURISDICTION: "eu" })).toBe(
      `${ACCOUNT}.eu.r2.cloudflarestorage.com`,
    );
    expect(r2ApiHost({ R2_ACCOUNT_ID: "evil.com/x" })).toBeNull();
    expect(r2ApiHost({})).toBeNull();
  });

  it("takes the account from CLOUDFLARE_ACCOUNT_ID or an R2 API endpoint, R2_ACCOUNT_ID first", () => {
    expect(r2ApiHost({ CLOUDFLARE_ACCOUNT_ID: ACCOUNT })).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(r2ApiHost({ R2_ENDPOINT: `https://${ACCOUNT}.eu.r2.cloudflarestorage.com/` })).toBe(
      `${ACCOUNT}.eu.r2.cloudflarestorage.com`,
    );
    const other = "f".repeat(32);
    expect(r2ApiHost({ R2_ACCOUNT_ID: other, CLOUDFLARE_ACCOUNT_ID: ACCOUNT })).toBe(`${other}.r2.cloudflarestorage.com`);
    // A public r2.dev endpoint says nothing about the account.
    expect(r2ApiHost({ R2_ENDPOINT: "https://pub-abc123.r2.dev" })).toBeNull();
    expect(r2ApiHost({ R2_ENDPOINT: `https://${ACCOUNT}.r2.cloudflarestorage.com.evil.com` })).toBeNull();
  });

  it("reads the buckets under either name and defaults the private one to the Worker archive bucket", () => {
    expect(r2PublicBucket({ R2_BUCKET_NAME: "mployedin" })).toBe("mployedin");
    expect(r2PublicBucket({ R2_PUBLIC_BUCKET: "pub", R2_BUCKET_NAME: "mployedin" })).toBe("pub");
    expect(r2PrivateBucket({})).toBe("mployedin-private");
    expect(r2PrivateBucket({ R2_PRIVATE_BUCKET: " priv " })).toBe("priv");
  });

  it("builds object URLs from the dashboard names too", () => {
    const env = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, R2_PUBLIC_ENDPOINT: "https://pub-abc123.r2.dev" };
    expect(r2UrlForKey("avatars/a.jpg", env)).toBe("https://pub-abc123.r2.dev/avatars/a.jpg");
    expect(r2UrlForKey("private/cvs/a.pdf", env)).toBe(
      `https://${ACCOUNT}.r2.cloudflarestorage.com/mployedin-private/private/cvs/a.pdf`,
    );
    expect(r2CspOrigins(env)).toEqual(["https://pub-abc123.r2.dev", `https://${ACCOUNT}.r2.cloudflarestorage.com`]);
  });

  it("normalises the public host and refuses anything that is not a bare host", () => {
    expect(r2PublicHost("https://CDN.Mployedin.com/")).toBe("cdn.mployedin.com");
    expect(r2PublicHost("cdn.mployedin.com/path?x")).toBeNull();
    expect(r2PublicHost("")).toBeNull();
    expect(r2PublicHost(undefined)).toBeNull();
  });

  it("adds no CSP origins until R2 is configured, then exactly its two hosts", () => {
    expect(r2CspOrigins({})).toEqual([]);
    expect(
      r2CspOrigins({ R2_ACCOUNT_ID: ACCOUNT, NEXT_PUBLIC_R2_PUBLIC_HOST: "cdn.mployedin.com" }),
    ).toEqual(["https://cdn.mployedin.com", `https://${ACCOUNT}.r2.cloudflarestorage.com`]);
  });

  it("recognises only our own R2 hosts over plain https", () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_HOST = "cdn.mployedin.com";
    process.env.R2_ACCOUNT_ID = ACCOUNT;
    expect(isOwnR2Address("https://cdn.mployedin.com/avatars/a.jpg")).toBe(true);
    expect(isOwnR2Address(`https://${ACCOUNT}.r2.cloudflarestorage.com/priv/private/cvs/a.pdf`)).toBe(true);
    expect(isOwnR2Address("http://cdn.mployedin.com/a.jpg")).toBe(false);
    expect(isOwnR2Address("https://cdn.mployedin.com.evil.com/a.jpg")).toBe(false);
    expect(isOwnR2Address("https://user:pw@cdn.mployedin.com/a.jpg")).toBe(false);
    expect(isOwnR2Address("https://other.r2.cloudflarestorage.com/a")).toBe(false);
    expect(isOwnR2Address("not a url")).toBe(false);
  });
});
