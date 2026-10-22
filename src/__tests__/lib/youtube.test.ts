/**
 * @jest-environment node
 *
 * One place decides whether a CMS video URL is something we may embed. The
 * landing page used to regex the URL and fall back to "use it as is", which let
 * any admin-pasted address reach an <iframe>. Now only these YouTube shapes
 * yield an id; everything else yields null and nothing is framed.
 */
import {
  parseYouTubeId,
  youtubeEmbedSrc,
  youtubeWatchUrl,
} from "@/lib/cms/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeId", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, "watch page"],
    [`https://youtube.com/watch?v=${ID}`, "watch page, no www"],
    [`http://www.youtube.com/watch?v=${ID}`, "watch page over http"],
    [`https://m.youtube.com/watch?v=${ID}`, "mobile watch page"],
    [`https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`, "watch page with other params first"],
    [`https://youtu.be/${ID}`, "short link"],
    [`https://youtu.be/${ID}?si=abc123`, "short link with a tracking param"],
    [`https://www.youtube.com/embed/${ID}`, "embed URL"],
    [`https://www.youtube-nocookie.com/embed/${ID}`, "privacy-enhanced embed URL"],
    [`https://youtube-nocookie.com/embed/${ID}`, "privacy-enhanced embed URL, no www"],
    [`  https://www.youtube.com/watch?v=${ID}  `, "surrounding whitespace"],
    [`https://WWW.YouTube.com/watch?v=${ID}`, "mixed-case host"],
  ])("returns the id for %s (%s)", (url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });

  it.each([
    ["https://vimeo.com/123456", "Vimeo"],
    ["https://player.vimeo.com/video/123456", "Vimeo player"],
    ["https://example.com/video.mp4", "another host"],
    ["https://fakeyoutube.com/watch?v=dQw4w9WgXcQ", "look-alike host"],
    ["https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "host that only starts with youtube.com"],
    ["https://evil.com/?u=https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube URL inside a query"],
    ["https://evil.com/youtu.be/dQw4w9WgXcQ", "YouTube host inside a path"],
    ["https://user:pass@www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "credentials trick"],
    ["javascript:alert(1)", "javascript: URL"],
    ["data:text/html,<h1>x</h1>", "data: URL"],
    ["ftp://www.youtube.com/watch?v=dQw4w9WgXcQ", "non-http scheme"],
    ["https://www.youtube.com/watch?v=short", "id too short"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQtoolong", "id too long"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXc!", "id with a bad character"],
    ["https://www.youtube.com/watch", "watch page with no id"],
    ["https://www.youtube.com/", "bare host"],
    ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "channel page"],
    ["https://www.youtube.com/playlist?list=PLabcdefghijk", "playlist"],
    ["https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ", "nocookie host without /embed/"],
    ["https://youtu.be/", "short link with no id"],
    ["not a url", "not a URL"],
    ["", "empty string"],
  ])("returns null for %s (%s)", (url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });

  it("returns null for values that are not strings", () => {
    expect(parseYouTubeId(undefined as unknown as string)).toBeNull();
    expect(parseYouTubeId(null as unknown as string)).toBeNull();
  });
});

describe("youtubeEmbedSrc", () => {
  it("always uses the privacy-enhanced host", () => {
    expect(youtubeEmbedSrc(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
  });

  it("adds autoplay only when asked", () => {
    expect(youtubeEmbedSrc(ID, { autoplay: true })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
    expect(youtubeEmbedSrc(ID, { autoplay: false })).not.toContain("autoplay");
  });
});

describe("youtubeWatchUrl", () => {
  it("points at the public watch page", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});
