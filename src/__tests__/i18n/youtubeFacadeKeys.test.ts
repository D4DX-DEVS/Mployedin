/**
 * @jest-environment node
 *
 * The click-to-load video placeholder reads four strings from the landing
 * namespace (the one the public layout already hands to client components). A
 * missing key crashes the landing page in next-intl, so both locales are pinned.
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

const KEYS = ["youtubePlay", "youtubeWatchOn", "youtubeNotice", "youtubeAlways"] as const;

function landing(messages: unknown): Record<string, unknown> {
  return (messages as { landing: Record<string, unknown> }).landing;
}

describe("YouTube facade copy", () => {
  it("uses the agreed English wording", () => {
    // [LEGAL] youtubeNotice: the PECR plan's disclosure shown beside the play button.
    expect(landing(en).youtubePlay).toBe("Play video (loads YouTube)");
    expect(landing(en).youtubeWatchOn).toBe("Watch on YouTube");
    expect(landing(en).youtubeNotice).toBe("Playing loads content from YouTube (Google), which may set cookies.");
    expect(landing(en).youtubeAlways).toBe("Always play videos");
  });

  describe.each([
    ["en", en],
    ["ar", ar],
  ] as const)("%s", (locale, messages) => {
    it.each(KEYS)("has %s", (key) => {
      const value = landing(messages)[key];
      expect(typeof value === "string" && value.trim() !== "").toBe(true);
      if (locale === "ar") expect(value).not.toBe(landing(en)[key]);
    });

    it("never says 'Failed to' and carries no [LEGAL] marker on screen", () => {
      for (const key of KEYS) expect(String(landing(messages)[key])).not.toMatch(/\[LEGAL\]|^Failed to/);
    });
  });

  it("tells admins, under the field, which link the Videos form needs (both languages)", () => {
    const hint = (messages: unknown) => (messages as { adminCmsVideos: Record<string, string> }).adminCmsVideos.videoUrlHint;
    expect(hint(en)).toBe("Use a YouTube video link (youtube.com/watch?v=… or youtu.be/…)");
    expect(typeof hint(ar)).toBe("string");
    expect(hint(ar)).not.toBe(hint(en));
    expect(hint(ar)).toMatch(/YouTube/);
    expect(hint(ar)).toMatch(/youtube\.com\/watch\?v=/);
    expect(hint(ar)).toMatch(/youtu\.be\//);
    for (const messages of [en, ar]) expect(hint(messages)).not.toMatch(/Vimeo|Failed to/);
  });

  it("tells admins the video field takes YouTube links only, in both languages", () => {
    const label = (messages: unknown) => (messages as { adminCmsVideos: Record<string, string> }).adminCmsVideos.videoUrlLabel;
    expect(label(en)).toMatch(/YouTube/);
    expect(label(en)).not.toMatch(/Vimeo/);
    expect(label(ar)).toMatch(/YouTube/);
    expect(label(ar)).not.toMatch(/Vimeo/);
    const description = (messages: unknown) =>
      (messages as { adminCmsVideos: Record<string, string> }).adminCmsVideos.pageDescription;
    expect(description(en)).toMatch(/YouTube/);
    expect(description(ar)).toMatch(/YouTube/);
    expect(description(en)).not.toMatch(/Vimeo/);
    expect(description(ar)).not.toMatch(/Vimeo/);
  });
});
