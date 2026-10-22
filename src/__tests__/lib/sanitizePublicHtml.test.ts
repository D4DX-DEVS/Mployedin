/**
 * @jest-environment node
 *
 * CMS rich text (blog posts, legal pages) is rendered with dangerouslySetInnerHTML on public
 * pages. sanitizeHtml allows <img src="https://..."> for any host, so a post body could make a
 * visitor's browser contact a third party before any cookie choice. sanitizePublicHtml applies the
 * same image rule as toPublicImageSrc to every <img> in the body. sanitizeHtml itself is unchanged.
 *
 * Jest runs against a stand-in for DOMPurify (src/__mocks__/isomorphic-dompurify.ts; the real one needs
 * jsdom, which Jest cannot load), so the hook's own logic is tested below on small element stand-ins, and
 * the real DOMPurify run is a script (see the Review fix round in decline-fix-report.md).
 */
import { restrictImagesToPublicSources } from "@/lib/images/publicImageHook";
import { sanitizeHtml, sanitizePublicHtml } from "@/lib/security/html";

const OWN = "https://d4dx-storage.blr1.digitaloceanspaces.com/blog/cover.jpg";
const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";

describe("sanitizePublicHtml", () => {
  it("removes an <img> from a third-party host and keeps the text around it", () => {
    const html = sanitizePublicHtml('<p>Hello <img src="https://i.pravatar.cc/300" alt="x"> world</p>');
    expect(html).not.toContain("pravatar");
    expect(html).not.toContain("<img");
    expect(html).toBe("<p>Hello  world</p>");
  });

  it.each([
    ["protocol-relative", "//i.pravatar.cc/300"],
    ["a backslash host", "/\\i.pravatar.cc/300"],
    ["a plain http host", "http://i.pravatar.cc/300"],
    ["Cloudinary (shared by every account)", "https://res.cloudinary.com/demo/image/upload/a.jpg"],
    ["a host with credentials", "https://user:pw@d4dx-storage.blr1.digitaloceanspaces.com/a.jpg"],
    ["a port", "https://d4dx-storage.blr1.digitaloceanspaces.com:8443/a.jpg"],
  ])("removes an <img> whose src is %s", (_label, src) => {
    const html = sanitizePublicHtml(`<p>a<img src="${src}">b</p>`);
    expect(html).toBe("<p>ab</p>");
  });

  it("removes an <img> with no src", () => {
    expect(sanitizePublicHtml('<p><img alt="x"></p>')).toBe("<p></p>");
  });

  it("keeps an <img> from our own storage as written", () => {
    const html = sanitizePublicHtml(`<p><img src="${OWN}" alt="Cover" width="300"></p>`);
    expect(html).toContain(`src="${OWN}"`);
    expect(html).toContain('alt="Cover"');
  });

  it("sends a Google or LinkedIn photo through the first-party proxy", () => {
    const html = sanitizePublicHtml(`<img src="${GOOGLE}" alt="">`);
    expect(html).toContain(`src="/api/proxy-image?url=${encodeURIComponent(GOOGLE)}"`);
    expect(html).not.toContain("googleusercontent.com/a");
  });

  it("handles several images in one body, one by one", () => {
    const html = sanitizePublicHtml(`<img src="${OWN}"><img src="https://i.pravatar.cc/300"><img src="${OWN}">`);
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).not.toContain("pravatar");
  });

  it("still strips scripts and event handlers, and keeps links and text formatting", () => {
    const html = sanitizePublicHtml('<h2>T</h2><a href="https://example.com/x" onclick="x()">link</a><script>alert(1)</script><strong>b</strong>');
    expect(html).toBe('<h2>T</h2><a href="https://example.com/x">link</a><strong>b</strong>');
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizePublicHtml(null)).toBe("");
    expect(sanitizePublicHtml(undefined)).toBe("");
    expect(sanitizePublicHtml("")).toBe("");
  });

  it("leaves sanitizeHtml alone for every other caller, before and after a public call", () => {
    const body = '<p><img src="https://i.pravatar.cc/300"></p>';
    expect(sanitizeHtml(body)).toContain("https://i.pravatar.cc/300");
    sanitizePublicHtml(body);
    expect(sanitizeHtml(body)).toContain("https://i.pravatar.cc/300");
  });

  it("does not leave its hook installed when the content is unusual", () => {
    expect(() => sanitizePublicHtml("<<img src=x>>\u0000<img src=https://i.pravatar.cc/1")).not.toThrow();
    expect(sanitizeHtml('<img src="https://i.pravatar.cc/300">')).toContain("pravatar");
  });
});

describe("restrictImagesToPublicSources (the hook itself)", () => {
  function fakeImg(src: string | null, tagName = "IMG") {
    const attrs = new Map<string, string>(src === null ? [] : [["src", src]]);
    const removed: unknown[] = [];
    const raw = {
      tagName,
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      parentNode: { removeChild: (child: unknown) => void removed.push(child) },
    };
    return { node: raw as unknown as Element, attrs, removed, raw };
  }

  it("removes the node when the src is not one a public page may load", () => {
    for (const src of ["https://i.pravatar.cc/300", "//i.pravatar.cc/300", "/\\i.pravatar.cc/300", null]) {
      const img = fakeImg(src);
      restrictImagesToPublicSources(img.node);
      expect(img.removed).toEqual([img.raw]);
    }
  });

  it("keeps the node and rewrites a provider photo to the proxy", () => {
    const img = fakeImg(GOOGLE);
    restrictImagesToPublicSources(img.node);
    expect(img.removed).toEqual([]);
    expect(img.attrs.get("src")).toBe(`/api/proxy-image?url=${encodeURIComponent(GOOGLE)}`);
  });

  it("leaves a node from our own storage as it is", () => {
    const img = fakeImg(OWN);
    restrictImagesToPublicSources(img.node);
    expect(img.removed).toEqual([]);
    expect(img.attrs.get("src")).toBe(OWN);
  });

  it("ignores every other element", () => {
    const link = fakeImg("https://i.pravatar.cc/300", "A");
    restrictImagesToPublicSources(link.node);
    expect(link.removed).toEqual([]);
    expect(link.attrs.get("src")).toBe("https://i.pravatar.cc/300");
  });
});
