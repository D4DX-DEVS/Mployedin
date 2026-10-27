/**
 * @jest-environment node
 */
import { ObjectId } from "mongodb";
import {
  createRewriter,
  isPublicObject,
  r2KeyForSpacesKey,
  spacesHosts,
  type ManifestEntry,
} from "@/lib/storage/migration/spacesToR2";

const HOSTS = spacesHosts({
  SPACES_BUCKET_NAME: "d4dx-storage",
  SPACES_ENDPOINT: "blr1.digitaloceanspaces.com",
});

const entries: ManifestEntry[] = [
  {
    oldKey: "Mployedin/avatars/a.png",
    newKey: "avatars/a.jpg",
    newUrl: "https://cdn.mployedin.com/avatars/a.jpg",
    isPublic: true,
    optimized: true,
    size: 10,
  },
  {
    oldKey: "Mployedin/resources/r.pdf",
    newKey: "private/resources/r.pdf",
    newUrl: "https://acct.r2.cloudflarestorage.com/priv/private/resources/r.pdf",
    isPublic: false,
    optimized: false,
    size: 20,
  },
];

describe("r2KeyForSpacesKey", () => {
  it("drops the Spaces root, marks private objects and swaps a re-encoded extension", () => {
    expect(r2KeyForSpacesKey("Mployedin/avatars/a.png", { spacesPrefix: "Mployedin", isPublic: true })).toBe("avatars/a.png");
    expect(r2KeyForSpacesKey("Mployedin/cvs/b.pdf", { spacesPrefix: "Mployedin/", isPublic: false })).toBe("private/cvs/b.pdf");
    expect(r2KeyForSpacesKey("avatars/a.png", { isPublic: true, newExt: ".jpg" })).toBe("avatars/a.jpg");
    expect(r2KeyForSpacesKey("media/noext", { isPublic: true, newExt: ".png" })).toBe("media/noext.png");
    // A key outside the root keeps its path.
    expect(r2KeyForSpacesKey("other/x.txt", { spacesPrefix: "Mployedin", isPublic: true })).toBe("other/x.txt");
  });
});

describe("isPublicObject", () => {
  it("keeps CVs, documents and exports private even when a legacy ACL says public-read", () => {
    expect(isPublicObject("Mployedin/documents/a.pdf", true, "Mployedin")).toBe(false);
    expect(isPublicObject("cvs/a.pdf", true)).toBe(false);
    expect(isPublicObject("exports/a.zip", true)).toBe(false);
    expect(isPublicObject("Mployedin/avatars/a.png", true, "Mployedin")).toBe(true);
    expect(isPublicObject("avatars/a.png", false)).toBe(false);
  });
});

describe("spacesHosts", () => {
  it("lists the origin and CDN hosts, plus a custom CDN endpoint", () => {
    expect([...HOSTS].sort()).toEqual(["d4dx-storage.blr1.cdn.digitaloceanspaces.com", "d4dx-storage.blr1.digitaloceanspaces.com"]);
    const withCdn = spacesHosts({ DO_SPACES_CDN_ENDPOINT: "https://files.example.com" });
    expect(withCdn.has("files.example.com")).toBe(true);
  });
});

describe("createRewriter", () => {
  const rewriter = createRewriter(entries, HOSTS);

  it("rewrites URL fields, bare keys and URLs inside HTML; counts each", () => {
    const id = new ObjectId();
    const when = new Date("2026-10-01");
    const doc = {
      avatar: "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/Mployedin/avatars/a.png",
      files: [{ key: "Mployedin/resources/r.pdf", fileName: "r.pdf" }],
      body: '<p><img src="https://d4dx-storage.blr1.digitaloceanspaces.com/Mployedin/avatars/a.png" alt=""></p>',
      ownerId: id,
      createdAt: when,
      untouched: { nested: "plain text" },
    };
    const { value, changed } = rewriter.rewrite(doc);
    expect(changed).toBe(3);
    expect(value.avatar).toBe("https://cdn.mployedin.com/avatars/a.jpg");
    expect(value.files[0]).toEqual({ key: "private/resources/r.pdf", fileName: "r.pdf" });
    expect(value.body).toBe('<p><img src="https://cdn.mployedin.com/avatars/a.jpg" alt=""></p>');
    // Non-plain values and untouched branches keep their identity.
    expect(value.ownerId).toBe(id);
    expect(value.createdAt).toBe(when);
    expect(value.untouched).toBe(doc.untouched);
  });

  it("leaves unknown objects, other hosts and look-alike hosts alone", () => {
    const doc = {
      a: "https://d4dx-storage.blr1.digitaloceanspaces.com/Mployedin/avatars/missing.png",
      b: "https://elsewhere.example/Mployedin/avatars/a.png",
      c: "https://d4dx-storage.blr1.digitaloceanspaces.com.evil.example/Mployedin/avatars/a.png",
      d: "Mployedin/avatars/a.png is mentioned in text",
      e: "bad escape https://d4dx-storage.blr1.digitaloceanspaces.com/Mployedin/%E0%A4%A.png in text",
    };
    const { value, changed } = rewriter.rewrite(doc);
    expect(changed).toBe(0);
    expect(value).toBe(doc);
  });

  it("is idempotent: rewritten values never match again", () => {
    const once = rewriter.rewrite({ u: "https://d4dx-storage.blr1.digitaloceanspaces.com/Mployedin/avatars/a.png" });
    expect(rewriter.rewrite(once.value).changed).toBe(0);
  });
});
