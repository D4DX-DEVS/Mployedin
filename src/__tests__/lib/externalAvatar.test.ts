import {
  PROVIDER_AVATAR_HOSTS,
  isProviderAvatarHost,
  toPublicImageSrc,
  toSafeImageSrc,
} from "@/lib/images/externalAvatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";
const LINKEDIN = "https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-shrink_100_100/0/1?e=1&t=sig&v=beta";

function proxied(url: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

describe("toSafeImageSrc", () => {
  it("sends a Google avatar through the first-party proxy", () => {
    expect(toSafeImageSrc(GOOGLE)).toBe(proxied(GOOGLE));
  });

  it("sends a LinkedIn avatar through the first-party proxy and keeps its signed query intact", () => {
    const out = toSafeImageSrc(LINKEDIN);
    expect(out).toBe(proxied(LINKEDIN));
    const decoded = new URL(out!, "https://app.test").searchParams.get("url");
    expect(decoded).toBe(LINKEDIN);
  });

  it("accepts a real subdomain of a provider host on a dot boundary", () => {
    const url = "https://cdn.lh3.googleusercontent.com/x";
    expect(toSafeImageSrc(url)).toBe(proxied(url));
  });

  it("treats a protocol-relative provider URL as the https URL it is", () => {
    const url = "//lh3.googleusercontent.com/a/x";
    expect(toSafeImageSrc(url)).toBe(proxied("https:" + url));
  });

  it("does not match a host that merely ends with, or starts with, a provider name", () => {
    for (const url of [
      "https://lh3.googleusercontent.com.evil.com/a/x",
      "https://evillh3.googleusercontent.com/a/x",
      "https://evil.com/lh3.googleusercontent.com/a/x",
      "https://evil.com/?u=https://media.licdn.com/x",
      "https://media.licdn.com.evil.com/x",
      "https://lh3.googleusercontent.com@evil.com/x",
    ]) {
      expect(toSafeImageSrc(url)).toBe(url);
    }
  });

  it("leaves our own storage, relative paths, data and blob URLs, and other hosts unchanged", () => {
    for (const url of [
      "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg",
      "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/avatars/a.jpg",
      "https://res.cloudinary.com/demo/image/upload/a.jpg",
      "/avatars/default.png",
      "/api/proxy-image?url=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fx",
      "data:image/png;base64,AAAA",
      "blob:https://app.test/1234",
      "https://i.pravatar.cc/150?img=3",
      "relative/path.png",
    ]) {
      expect(toSafeImageSrc(url)).toBe(url);
    }
  });

  it("leaves an http provider URL alone (the proxy is https-only and the CSP never allowed http)", () => {
    const url = "http://lh3.googleusercontent.com/a/x";
    expect(toSafeImageSrc(url)).toBe(url);
  });

  it("returns undefined for empty input", () => {
    expect(toSafeImageSrc(undefined)).toBeUndefined();
    expect(toSafeImageSrc(null)).toBeUndefined();
    expect(toSafeImageSrc("")).toBeUndefined();
    expect(toSafeImageSrc("   ")).toBeUndefined();
  });

  it("does not throw on a string that is not a URL", () => {
    expect(toSafeImageSrc("https://")).toBe("https://");
    expect(toSafeImageSrc("not a url at all")).toBe("not a url at all");
  });
});

describe("toPublicImageSrc (public pages: the browser may only talk to our origin or our own storage)", () => {
  it("keeps same-origin paths, data: and blob: URLs", () => {
    for (const url of ["/avatars/default.png", "relative/path.png", "data:image/png;base64,AAAA", "blob:https://app.test/1234"]) {
      expect(toPublicImageSrc(url)).toBe(url);
    }
  });

  it("sends a provider photo through the first-party proxy", () => {
    expect(toPublicImageSrc(GOOGLE)).toBe(proxied(GOOGLE));
    expect(toPublicImageSrc(LINKEDIN)).toBe(proxied(LINKEDIN));
  });

  it("keeps our own storage (Spaces and its CDN), which the CSP already lists", () => {
    for (const url of [
      "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg",
      "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/avatars/a.jpg",
    ]) {
      expect(toPublicImageSrc(url)).toBe(url);
    }
  });

  it("does not trust Cloudinary: res.cloudinary.com serves every Cloudinary account, and Spaces replaced it", () => {
    expect(toPublicImageSrc("https://res.cloudinary.com/demo/image/upload/a.jpg")).toBeUndefined();
  });

  describe("when the Spaces host is pinned (NEXT_PUBLIC_SPACES_PUBLIC_HOST)", () => {
    const original = process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST;
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST = "d4dx-storage.blr1.cdn.digitaloceanspaces.com";
    });
    afterEach(() => {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST;
      else process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST = original;
    });

    it("accepts only that host, not any other bucket on digitaloceanspaces.com", () => {
      const ours = "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/avatars/a.jpg";
      expect(toPublicImageSrc(ours)).toBe(ours);
      expect(toPublicImageSrc("https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg")).toBeUndefined();
      expect(toPublicImageSrc("https://someone-elses-bucket.nyc3.digitaloceanspaces.com/a.jpg")).toBeUndefined();
    });

    it("matches the host case-insensitively", () => {
      const url = "https://D4DX-Storage.blr1.cdn.digitaloceanspaces.com/a.jpg";
      expect(toPublicImageSrc(url)).toBe(url);
    });

    it("accepts a comma list (bucket host and its CDN host), as DEPLOYMENT.md and /api/image-proxy allow", () => {
      process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST =
        " d4dx-storage.blr1.digitaloceanspaces.com , d4dx-storage.blr1.cdn.digitaloceanspaces.com ";
      const bucket = "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg";
      const cdn = "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/avatars/a.jpg";
      expect(toPublicImageSrc(bucket)).toBe(bucket);
      expect(toPublicImageSrc(cdn)).toBe(cdn);
      expect(toPublicImageSrc("https://someone-elses-bucket.nyc3.digitaloceanspaces.com/a.jpg")).toBeUndefined();
    });
  });

  it("refuses a URL with a port, even on our own host", () => {
    expect(toPublicImageSrc("https://d4dx-storage.blr1.digitaloceanspaces.com:8443/a.jpg")).toBeUndefined();
    expect(toPublicImageSrc("https://lh3.googleusercontent.com:8443/a")).toBeUndefined();
  });

  it("refuses any other host: no third-party request, the caller shows its fallback", () => {
    for (const url of [
      "https://i.pravatar.cc/300",
      "//i.pravatar.cc/300",
      "http://i.pravatar.cc/300",
      "https://images.unsplash.com/photo-1",
      "https://digitaloceanspaces.com.evil.com/a.jpg",
      "https://evildigitaloceanspaces.com/a.jpg",
      "https://res.cloudinary.com/demo/image/upload/a.jpg",
      "https://d4dx-storage.blr1.digitaloceanspaces.com@evil.com/a.jpg",
      "https://evil.com/?u=https://d4dx-storage.blr1.digitaloceanspaces.com/a.jpg",
      "http://d4dx-storage.blr1.digitaloceanspaces.com/a.jpg",
      "ftp://evil.com/a.jpg",
      "javascript:alert(1)",
    ]) {
      expect(toPublicImageSrc(url)).toBeUndefined();
    }
  });

  // A browser reads a backslash as a slash and drops tabs and newlines inside a URL, so these are all
  // "//i.pravatar.cc/300" in the browser's eyes even though they carry no scheme.
  it("refuses values a browser would read as a protocol-relative URL (backslashes, tabs, newlines)", () => {
    for (const url of [
      "/\\i.pravatar.cc/300",
      "\\\\i.pravatar.cc/300",
      "/\t/i.pravatar.cc/300",
      "/\n/i.pravatar.cc/300",
      "/\r/i.pravatar.cc/300",
      "/\u0000/i.pravatar.cc/300",
      "java\tscript:alert(1)",
      "ht\ttps://i.pravatar.cc/300",
      "/..\\i.pravatar.cc/300",
    ]) {
      expect(toPublicImageSrc(url)).toBeUndefined();
    }
  });

  it("keeps a relative path only when it resolves to our own origin", () => {
    for (const url of ["/a/b.png", "a/b.png", "./a.png", "../a.png", "/a.png?x=1#y", "/avatars/%5Cname.png"]) {
      expect(toPublicImageSrc(url)).toBe(url);
    }
  });

  it("returns undefined for empty input and for text that is not a URL", () => {
    expect(toPublicImageSrc(undefined)).toBeUndefined();
    expect(toPublicImageSrc(null)).toBeUndefined();
    expect(toPublicImageSrc("  ")).toBeUndefined();
    expect(toPublicImageSrc("https://")).toBeUndefined();
  });
});

describe("isProviderAvatarHost", () => {
  it("is the one list the proxy and the rewrite share", () => {
    expect([...PROVIDER_AVATAR_HOSTS].sort()).toEqual(["lh3.googleusercontent.com", "media.licdn.com"]);
  });

  it("matches the host or a dot-boundary subdomain, case-insensitively", () => {
    expect(isProviderAvatarHost("lh3.googleusercontent.com")).toBe(true);
    expect(isProviderAvatarHost("LH3.GoogleUserContent.com")).toBe(true);
    expect(isProviderAvatarHost("a.media.licdn.com")).toBe(true);
    expect(isProviderAvatarHost("googleusercontent.com")).toBe(false);
    expect(isProviderAvatarHost("xmedia.licdn.com")).toBe(false);
    expect(isProviderAvatarHost("media.licdn.com.evil.com")).toBe(false);
    expect(isProviderAvatarHost("")).toBe(false);
  });
});
