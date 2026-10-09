import { videoCreateSchema, videoUpdateSchema } from "@/lib/validators/cms";

// BUG-005: the Video URL field is labelled YouTube/Vimeo — the API must not
// accept arbitrary URLs or non-http(s) schemes.
describe("video URL validation (BUG-005)", () => {
  const valid = [
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.youtube-nocookie.com/embed/abc123",
    "https://vimeo.com/123456",
    "https://www.vimeo.com/123456",
    "https://player.vimeo.com/video/123456",
    "http://www.youtube.com/watch?v=abc123",
  ];
  const invalid = [
    "https://example.com/video.mp4",
    "http://evil.com/x",
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "ftp://files.example.com/v.mp4",
    "not a url",
    "",
    "https://fakeyoutube.com/watch?v=abc",
    "https://youtube.com.evil.com/watch?v=abc",
  ];

  it.each(valid)("accepts %s", (url) => {
    expect(videoCreateSchema.safeParse({ title: "T", url }).success).toBe(true);
  });

  it.each(invalid)("rejects %s", (url) => {
    expect(videoCreateSchema.safeParse({ title: "T", url }).success).toBe(false);
  });

  it("applies the same rule on update", () => {
    expect(videoUpdateSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
    expect(
      videoUpdateSchema.safeParse({ url: "https://vimeo.com/123" }).success,
    ).toBe(true);
  });
});
