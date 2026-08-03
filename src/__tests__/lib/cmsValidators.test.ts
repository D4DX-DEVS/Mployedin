import { testimonialCreateSchema, bannerCreateSchema } from "@/lib/validators/cms";

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
