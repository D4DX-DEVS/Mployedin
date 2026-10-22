/**
 * The landing page's videos section: only YouTube records are shown, each as a
 * click-to-load facade. A record that is not a YouTube link (an old Vimeo
 * record, say) is skipped, never framed.
 */
import { render, screen } from "@testing-library/react";
import { VideosSection } from "@/components/features/public/landing/CmsSections";
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent/state";
import type { Video } from "@/components/features/public/landing/types";

function video(overrides: Partial<Video> & { _id: string; url: string }): Video {
  return {
    title: `Title ${overrides._id}`,
    titleAr: "",
    description: "",
    descriptionAr: "",
    ...overrides,
  } as Video;
}

const YT_A = video({ _id: "a", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
const YT_B = video({ _id: "b", url: "https://youtu.be/9bZkp7q19f0", title: "Second talk" });
const VIMEO = video({ _id: "v", url: "https://vimeo.com/123456", title: "Old Vimeo record" });
const UNKNOWN = video({ _id: "u", url: "https://example.com/video.mp4", title: "Raw file" });

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
});

describe("VideosSection", () => {
  it("renders a click-to-load placeholder per YouTube video, and no iframe", () => {
    const { container } = render(<VideosSection locale="en" videos={[YT_A, YT_B]} />);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Play video (loads YouTube)" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Watch on YouTube (opens in a new tab)" }).map((a) => a.getAttribute("href"))).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=9bZkp7q19f0",
    ]);
  });

  it("never renders a Vimeo or unknown URL, in an iframe or otherwise", () => {
    const { container } = render(<VideosSection locale="en" videos={[VIMEO, UNKNOWN, YT_A]} />);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(screen.queryByText("Old Vimeo record")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw file")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/vimeo|example\.com/i);
    expect(screen.getAllByRole("button", { name: "Play video (loads YouTube)" })).toHaveLength(1);
  });

  it("renders nothing, heading included, when no record is a YouTube link", () => {
    const { container } = render(<VideosSection locale="en" videos={[VIMEO, UNKNOWN]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<VideosSection locale="en" videos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not let a skipped record use up one of the three places", () => {
    const more = ["c", "d"].map((id, i) =>
      video({ _id: id, url: `https://www.youtube.com/watch?v=${"abcdefghij"}${i}` }),
    );
    render(<VideosSection locale="en" videos={[VIMEO, YT_A, YT_B, ...more]} />);
    expect(screen.getAllByRole("button", { name: "Play video (loads YouTube)" })).toHaveLength(3);
  });

  it("uses the Arabic title when the locale is Arabic and one exists", () => {
    render(<VideosSection locale="ar" videos={[{ ...YT_A, titleAr: "عنوان عربي" }]} />);
    expect(screen.getAllByText("عنوان عربي").length).toBeGreaterThan(0);
  });

  it("plays in the facade without a click when Videos is already on", () => {
    const state = { v: CONSENT_VERSION, id: "x", preferences: true, media: true, at: "2026-10-21T00:00:00.000Z" };
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; Path=/`;
    const { container } = render(<VideosSection locale="en" videos={[YT_A]} />);
    const frames = container.querySelectorAll("iframe");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});
