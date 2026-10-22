import { videoCreateSchema, videoUpdateSchema } from "@/lib/validators/cms";
import { parseYouTubeId } from "@/lib/cms/youtube";

// BUG-005: the Video URL field must not accept arbitrary URLs or non-http(s)
// schemes. PECR click-to-load (owner decision D5): YouTube is the only video
// host, so Vimeo links are refused too — the landing page can't embed them.
// The landing page only renders a link that parseYouTubeId turns into an
// 11-character id, so that is the rule the admin form enforces as well: a link
// that would save and then show nothing (Shorts, a channel, a playlist, a
// mistyped id) is refused with a message instead.
const ID = "dQw4w9WgXcQ";

describe("video URL validation (BUG-005, D5: YouTube only)", () => {
  const valid = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abcdef`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ];
  const wrongHost = [
    "https://vimeo.com/123456",
    "https://www.vimeo.com/123456",
    "https://player.vimeo.com/video/123456",
    "https://example.com/video.mp4",
    "http://evil.com/x",
    "javascript:alert(1)",
    "data:text/html,<h1>x</h1>",
    "ftp://files.example.com/v.mp4",
    "not a url",
    "",
    "https://fakeyoutube.com/watch?v=abc",
    "https://youtube.com.evil.com/watch?v=abc",
    `https://evil.com/?u=https://www.youtube.com/watch?v=${ID}`,
  ];
  // Right host, but nothing the landing page could play: these used to save and then never show.
  const notAVideoLink = [
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
    "https://www.youtube.com/@mployedin",
    "https://www.youtube.com/playlist?list=PLabcdefghijk",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://youtu.be/",
    // Malformed ids: 11 characters of letters, digits, _ and - are required.
    "https://www.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.youtube-nocookie.com/embed/abc123",
    "https://www.youtube.com/watch?v=abcdefghijkl",
    "https://www.youtube.com/watch?v=dQw4w9WgXc!",
    "https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ",
  ];

  it.each(valid)("accepts %s", (url) => {
    expect(videoCreateSchema.safeParse({ title: "T", url }).success).toBe(true);
  });

  it.each([...wrongHost, ...notAVideoLink])("rejects %s", (url) => {
    expect(videoCreateSchema.safeParse({ title: "T", url }).success).toBe(false);
  });

  it("accepts exactly the links the landing page can play", () => {
    for (const url of [...valid, ...wrongHost, ...notAVideoLink]) {
      expect({ url, saves: videoCreateSchema.safeParse({ title: "T", url }).success }).toEqual({
        url,
        saves: parseYouTubeId(url) !== null,
      });
    }
  });

  it("applies the same rule on update", () => {
    expect(videoUpdateSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
    expect(videoUpdateSchema.safeParse({ url: "https://vimeo.com/123" }).success).toBe(false);
    expect(videoUpdateSchema.safeParse({ url: `https://www.youtube.com/shorts/${ID}` }).success).toBe(false);
    expect(videoUpdateSchema.safeParse({ url: "https://youtu.be/abc123" }).success).toBe(false);
    expect(videoUpdateSchema.safeParse({ url: `https://youtu.be/${ID}` }).success).toBe(true);
  });

  it("leaves a save that does not touch the URL alone", () => {
    expect(videoUpdateSchema.safeParse({ title: "New title", sortOrder: 2 }).success).toBe(true);
  });

  it("tells the admin that a YouTube video link is needed", () => {
    for (const url of ["https://vimeo.com/123456", `https://www.youtube.com/shorts/${ID}`, "https://youtu.be/abc123"]) {
      const result = videoCreateSchema.safeParse({ title: "T", url });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toBe("Use a YouTube video link (youtube.com/watch?v=… or youtu.be/…)");
        expect(message).not.toMatch(/Vimeo|Failed to/);
      }
    }
  });
});
