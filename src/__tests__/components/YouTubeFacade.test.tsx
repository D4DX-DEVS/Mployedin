/**
 * PECR: a YouTube video must not load, and YouTube/Google must receive nothing,
 * until the visitor asks for it. The facade shows a placeholder (no thumbnail
 * from i18n.ytimg.com, no iframe) and builds the iframe only on a click or when
 * the Videos choice is already on.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { YouTubeFacade, type YouTubeFacadeLabels } from "@/components/shared/ConsentManager/YouTubeFacade";
import { CONSENT_EVENT, readConsent, withdrawCleanup, writeConsent } from "@/lib/consent/client";
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "@/lib/consent/state";

const csrfFetchMock = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
}));

jest.mock("@/lib/consent/client", () => {
  const actual = jest.requireActual("@/lib/consent/client");
  return { ...actual, writeConsent: jest.fn(actual.writeConsent), withdrawCleanup: jest.fn(actual.withdrawCleanup) };
});

const ID = "dQw4w9WgXcQ";
const OTHER_ID = "9bZkp7q19f0";
const TITLE = "How hiring works";

const LABELS: YouTubeFacadeLabels = {
  play: "Play video (loads YouTube)",
  watchOnYoutube: "Watch on YouTube",
  notice: "Playing loads content from YouTube (Google), which may set cookies.",
  always: "Always play videos",
};

/** A stored choice, written the way writeConsent does, without firing the event. */
function storeChoice(choice: { preferences: boolean; media: boolean }): void {
  const state = { v: CONSENT_VERSION, id: "choice-1", ...choice, at: "2026-10-21T00:00:00.000Z" };
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; Path=/`;
}

function clearChoice(): void {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

/** What the cookie dialog does when the visitor saves: write the choice, which fires CONSENT_EVENT. */
function saveChoice(choice: { preferences: boolean; media: boolean }): void {
  const { writeConsent: real } = jest.requireActual("@/lib/consent/client") as { writeConsent: typeof writeConsent };
  act(() => {
    real(choice);
  });
}

function frames(root: ParentNode = document): HTMLIFrameElement[] {
  return Array.from(root.querySelectorAll("iframe"));
}

function renderFacade(props: Partial<{ videoId: string; title: string; locale: string }> = {}) {
  return render(
    <YouTubeFacade videoId={props.videoId ?? ID} title={props.title ?? TITLE} labels={LABELS} locale={props.locale ?? "en"} />,
  );
}

/** The JSON body of the n-th receipt POST. */
function receiptBody(n = 0): Record<string, unknown> {
  const call = csrfFetchMock.mock.calls[n] as [string, RequestInit] | undefined;
  if (!call) throw new Error(`no receipt request #${n}`);
  expect(call[0]).toBe("/api/consent/receipt");
  expect(call[1].method).toBe("POST");
  return JSON.parse(String(call[1].body));
}

beforeEach(() => {
  clearChoice();
  (writeConsent as jest.Mock).mockClear();
  (withdrawCleanup as jest.Mock).mockClear();
  csrfFetchMock.mockReset().mockResolvedValue({ ok: true, status: 204 });
});

describe("YouTubeFacade without media consent", () => {
  it.each([
    ["no choice made yet", null],
    ["Videos off", { preferences: true, media: false }],
    ["Reject all", { preferences: false, media: false }],
  ])("renders no iframe when %s", (_name, choice) => {
    if (choice) storeChoice(choice);
    const { container } = renderFacade();
    expect(frames(container)).toHaveLength(0);
  });

  it("shows the title, a play button and the notice in place of the video", () => {
    const { container } = renderFacade();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LABELS.play })).toBeInTheDocument();
    expect(screen.getByText(LABELS.notice)).toBeInTheDocument();
    // The "Play" icon is decoration on the brand background.
    expect(container.querySelector("svg.lucide-circle-play, svg.lucide-play-circle")).not.toBeNull();
  });

  it("loads nothing from YouTube's image host: no <img>, no ytimg URL anywhere", () => {
    const { container } = renderFacade();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toMatch(/ytimg|googlevideo/i);
  });

  it("links to the watch page, opened safely in a new tab", () => {
    renderFacade();
    const link = screen.getByRole("link", { name: LABELS.watchOnYoutube });
    expect(link).toHaveAttribute("href", `https://www.youtube.com/watch?v=${ID}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("describes the play button by the video title, so several of them are told apart", () => {
    renderFacade();
    const button = screen.getByRole("button", { name: LABELS.play });
    expect(button).toHaveAccessibleDescription(TITLE);
  });

  it("offers Always play videos as a checkbox", () => {
    renderFacade();
    const box = screen.getByRole("checkbox", { name: LABELS.always });
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("makes every control at least 44px tall for touch", () => {
    renderFacade();
    expect(screen.getByRole("button", { name: LABELS.play }).className).toContain("min-h-11");
    expect(screen.getByRole("link", { name: LABELS.watchOnYoutube }).className).toContain("min-h-11");
    expect(screen.getByText(LABELS.always).closest("label")?.className).toContain("min-h-11");
  });
});

describe("clicking Play", () => {
  it("loads that one video from youtube-nocookie.com and starts it", () => {
    const { container } = renderFacade();
    fireEvent.click(screen.getByRole("button", { name: LABELS.play }));
    const [frame, ...rest] = frames(container);
    expect(rest).toHaveLength(0);
    expect(frame.getAttribute("src")).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
    expect(frame).toHaveAttribute("title", TITLE);
    expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(screen.queryByRole("button", { name: LABELS.play })).not.toBeInTheDocument();
  });

  it("does not turn on Videos for the whole site", () => {
    renderFacade();
    fireEvent.click(screen.getByRole("button", { name: LABELS.play }));
    expect(writeConsent).not.toHaveBeenCalled();
    // One video is not a cookie choice: no receipt either.
    expect(csrfFetchMock).not.toHaveBeenCalled();
    expect(readConsent()).toBeNull();
    expect(document.cookie).not.toContain(CONSENT_COOKIE);
  });

  it("hands keyboard focus to the player, since the button that had it is gone", () => {
    const { container } = renderFacade();
    const button = screen.getByRole("button", { name: LABELS.play });
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(frames(container)[0]);
  });

  it("does not steal focus when a video simply renders because Videos is already on", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    expect(frames(container)).toHaveLength(1);
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the other videos on the page as placeholders", () => {
    render(
      <>
        <YouTubeFacade videoId={ID} title="First" labels={LABELS} locale="en" />
        <YouTubeFacade videoId={OTHER_ID} title="Second" labels={LABELS} locale="en" />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: LABELS.play })[0]);
    expect(frames()).toHaveLength(1);
    expect(frames()[0].getAttribute("src")).toContain(`/embed/${ID}`);
    expect(screen.getAllByRole("button", { name: LABELS.play })).toHaveLength(1);
  });

  it("puts the placeholder back when Videos is saved off afterwards", () => {
    const { container } = renderFacade();
    fireEvent.click(screen.getByRole("button", { name: LABELS.play }));
    expect(frames(container)).toHaveLength(1);
    saveChoice({ preferences: true, media: false });
    expect(frames(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: LABELS.play })).toBeInTheDocument();
  });
});

describe("Always play videos", () => {
  it("records the choice with Videos on and plays this video", () => {
    const { container } = renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    expect(writeConsent).toHaveBeenCalledTimes(1);
    expect(writeConsent).toHaveBeenCalledWith({ preferences: true, media: true });
    expect(readConsent()?.media).toBe(true);
    expect(frames(container)).toHaveLength(1);
    expect(frames(container)[0].getAttribute("src")).toContain("https://www.youtube-nocookie.com/embed/");
  });

  it("hands focus to this video's player, and only this one", () => {
    render(
      <>
        <YouTubeFacade videoId={ID} title="First" labels={LABELS} locale="en" />
        <YouTubeFacade videoId={OTHER_ID} title="Second" labels={LABELS} locale="en" />
      </>,
    );
    fireEvent.click(screen.getAllByRole("checkbox", { name: LABELS.always })[0]);
    const [first, second] = frames();
    expect(document.activeElement).toBe(first);
    expect(document.activeElement).not.toBe(second);
  });

  it("keeps the display-settings choice the visitor already made", () => {
    storeChoice({ preferences: false, media: false });
    renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    expect(writeConsent).toHaveBeenCalledWith({ preferences: false, media: true });
    expect(readConsent()).toMatchObject({ preferences: false, media: true });
  });

  it("keeps display settings on when no choice was made yet (owner decision D1)", () => {
    renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    expect(writeConsent).toHaveBeenCalledWith({ preferences: true, media: true });
  });

  it("records the choice like the banner does: one receipt that says Videos on and keeps the display setting", async () => {
    storeChoice({ preferences: false, media: false });
    renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));

    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    const stored = readConsent();
    expect(stored).toMatchObject({ preferences: false, media: true });
    expect(receiptBody()).toEqual({
      receiptId: stored!.id,
      preferences: false,
      media: true,
      version: 1,
      locale: "en",
      // The receipt route knows the banner and Cookie settings; this is a change to a setting.
      source: "settings",
    });
  });

  it("sends the receipt in the page's language", async () => {
    renderFacade({ locale: "ar" });
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(receiptBody()).toMatchObject({ preferences: true, media: true, locale: "ar" });
  });

  it("runs the same cleanup step as the banner, with the choice it replaced", async () => {
    const prev = writeConsent({ preferences: true, media: false });
    (writeConsent as jest.Mock).mockClear();
    renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(withdrawCleanup).toHaveBeenCalledTimes(1);
    const [cleanupPrev, cleanupNext] = (withdrawCleanup as jest.Mock).mock.calls[0];
    expect(cleanupPrev).toMatchObject({ id: prev.id });
    expect(cleanupNext).toMatchObject({ media: true });
  });

  it("still plays the video when the cookie can't be stored, and sends no receipt", async () => {
    (writeConsent as jest.Mock).mockImplementationOnce(() => {
      throw new Error("cookies blocked");
    });
    const { container } = renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    expect(frames(container)).toHaveLength(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("does not turn the receipt failing into an error on the page", async () => {
    csrfFetchMock.mockRejectedValue(new Error("offline"));
    const { container } = renderFacade();
    fireEvent.click(screen.getByRole("checkbox", { name: LABELS.always }));
    await waitFor(() => expect(csrfFetchMock).toHaveBeenCalledTimes(1));
    expect(readConsent()).toMatchObject({ media: true });
    expect(frames(container)).toHaveLength(1);
  });

  it("plays the other videos on the page from then on, without starting them", () => {
    render(
      <>
        <YouTubeFacade videoId={ID} title="First" labels={LABELS} locale="en" />
        <YouTubeFacade videoId={OTHER_ID} title="Second" labels={LABELS} locale="en" />
      </>,
    );
    fireEvent.click(screen.getAllByRole("checkbox", { name: LABELS.always })[0]);
    const sources = frames().map((frame) => frame.getAttribute("src"));
    expect(sources).toEqual([
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`,
      `https://www.youtube-nocookie.com/embed/${OTHER_ID}`,
    ]);
  });
});

describe("with Videos already on", () => {
  it("renders the iframe straight away, with no placeholder and no autoplay", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    const [frame, ...rest] = frames(container);
    expect(rest).toHaveLength(0);
    expect(frame.getAttribute("src")).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(screen.queryByRole("button", { name: LABELS.play })).not.toBeInTheDocument();
    expect(screen.queryByText(LABELS.notice)).not.toBeInTheDocument();
  });

  it("removes the iframe when the CONSENT_EVENT says Videos is off", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    expect(frames(container)).toHaveLength(1);
    saveChoice({ preferences: true, media: false });
    expect(frames(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: LABELS.play })).toBeInTheDocument();
  });

  it("removes the iframe on Reject all", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    saveChoice({ preferences: false, media: false });
    expect(frames(container)).toHaveLength(0);
  });

  it("keeps the iframe when the event keeps Videos on", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    saveChoice({ preferences: false, media: true });
    expect(frames(container)).toHaveLength(1);
  });

  it("starts a placeholder when Accept all arrives from the banner", () => {
    const { container } = renderFacade();
    expect(frames(container)).toHaveLength(0);
    saveChoice({ preferences: true, media: true });
    expect(frames(container)).toHaveLength(1);
  });

});

describe("layout when Play is pressed", () => {
  // The browser measures the real height (e2e/youtube-facade.spec.ts); jsdom has no layout, so this
  // pins the structure that keeps it still: one 16:9 frame that holds the placeholder and the player alike.
  const frameOf = (root: ParentNode) => root.querySelector<HTMLElement>("[data-youtube-frame]");

  it("holds the placeholder and the player in the same 16:9 frame, with the same classes", () => {
    const { container } = renderFacade();
    const frame = frameOf(container)!;
    expect(frame).not.toBeNull();
    expect(frame).toHaveClass("aspect-video");
    expect(frame.querySelector("iframe")).toBeNull();
    const classesBefore = frame.className;

    fireEvent.click(screen.getByRole("button", { name: LABELS.play }));

    const playing = frameOf(container)!;
    expect(playing.querySelector("iframe")).not.toBeNull();
    expect(playing.className).toBe(classesBefore);
    expect(playing.parentElement).toBe(frame.parentElement);
  });

  it("puts the player in that frame when Videos is already on", () => {
    storeChoice({ preferences: true, media: true });
    const { container } = renderFacade();
    const frame = frameOf(container)!;
    expect(frame).toHaveClass("aspect-video");
    expect(frame.querySelector("iframe")).not.toBeNull();
  });

  it("sets no height of its own on the frame besides the ratio, so the ratio decides it", () => {
    const { container } = renderFacade();
    expect(frameOf(container)!.className).not.toMatch(/(?:^|\s)(?:min-h|max-h|h)-/);
  });

  it("keeps the placeholder compact enough for the frame: the icon sits in the button and the title is one line", () => {
    const { container } = renderFacade();
    const play = screen.getByRole("button", { name: LABELS.play });
    expect(play.querySelector("svg.lucide-circle-play, svg.lucide-play-circle")).not.toBeNull();
    expect(screen.getByText(TITLE).className).toContain("line-clamp-1");
    // Nothing else draws a second icon above the title.
    expect(frameOf(container)!.querySelectorAll("svg.lucide-circle-play, svg.lucide-play-circle")).toHaveLength(1);
  });
});

describe("right-to-left", () => {
  it("renders the placeholder inside an RTL page with no left/right-only styling", () => {
    const { container } = render(
      <div dir="rtl">
        <YouTubeFacade videoId={ID} title={TITLE} labels={LABELS} locale="en" />
      </div>,
    );
    expect(screen.getByRole("button", { name: LABELS.play })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: LABELS.always })).toBeVisible();
    expect(screen.getByRole("link", { name: LABELS.watchOnYoutube })).toBeVisible();
    const physical = /^(?:-?(?:ml|mr|pl|pr|left|right)|text-(?:left|right)|rounded-(?:l|r|tl|tr|bl|br)|border-(?:l|r))(?:-|$)/;
    const offenders = Array.from(container.querySelectorAll("[class]"))
      .flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/))
      .filter((token) => physical.test(token));
    expect(offenders).toEqual([]);
  });

  it("plays inside an RTL page the same way", () => {
    const { container } = render(
      <div dir="rtl">
        <YouTubeFacade videoId={ID} title={TITLE} labels={LABELS} locale="en" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: LABELS.play }));
    expect(frames(container)).toHaveLength(1);
  });
});
