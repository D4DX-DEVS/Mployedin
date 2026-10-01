import { testimonialCreateSchema, bannerCreateSchema, blogCreateSchema, blogUpdateSchema } from "@/lib/validators/cms";

describe("CMS validators — image/link fields accept URLs and upload paths", () => {
  const base = { name: "A. Example", quote: "Great platform." };

  it("accepts an absolute avatar URL", () => {
    expect(testimonialCreateSchema.safeParse({ ...base, avatar: "https://cdn.example.com/a.png" }).success).toBe(true);
  });

  it("accepts an uploaded avatar path (previously rejected by .url())", () => {
    expect(testimonialCreateSchema.safeParse({ ...base, avatar: "/uploads/a.png" }).success).toBe(true);
  });

  it("accepts a blank avatar", () => {
    expect(testimonialCreateSchema.safeParse({ ...base, avatar: "" }).success).toBe(true);
  });

  it("still rejects a non-URL, non-path avatar", () => {
    expect(testimonialCreateSchema.safeParse({ ...base, avatar: "not a url" }).success).toBe(false);
  });

  it("accepts a relative banner image and internal link", () => {
    expect(bannerCreateSchema.safeParse({ image: "/uploads/banner.png", linkUrl: "/en/jobs" }).success).toBe(true);
  });

  it("rejects a banner with no image", () => {
    expect(bannerCreateSchema.safeParse({ linkUrl: "/en/jobs" }).success).toBe(false);
  });
});

// The admin form's Tags box is a plain text input, so it posts "a, b" — and the
// edit dialog stringifies a saved ["a","b"] back to "a,b". Both must parse.
describe("CMS validators — blog tags accept the form's comma-separated text", () => {
  const base = { title: "Test Blog Title", body: "Body." };

  it("splits a comma-separated string into trimmed tags", () => {
    const r = blogCreateSchema.safeParse({ ...base, tags: "recruitment, ips ,," });
    expect(r.success).toBe(true);
    expect(r.data?.tags).toEqual(["recruitment", "ips"]);
  });

  it("drops duplicate tags", () => {
    expect(blogCreateSchema.parse({ ...base, tags: "ips,ips" }).tags).toEqual(["ips"]);
  });

  it("treats a blank Tags box as no tags", () => {
    expect(blogCreateSchema.parse({ ...base, tags: "" }).tags).toEqual([]);
  });

  it("still accepts an array from API callers", () => {
    expect(blogCreateSchema.parse({ ...base, tags: ["a", "b"] }).tags).toEqual(["a", "b"]);
  });

  it("parses the edit dialog's stringified tags on update", () => {
    expect(blogUpdateSchema.parse({ tags: "recruitment,ips" }).tags).toEqual(["recruitment", "ips"]);
  });

  it("still rejects an over-long tag", () => {
    expect(blogCreateSchema.safeParse({ ...base, tags: "x".repeat(51) }).success).toBe(false);
  });
});
