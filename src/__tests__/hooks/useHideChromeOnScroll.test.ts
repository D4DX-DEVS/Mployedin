/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { useHideChromeOnScroll } from "@/hooks/useHideChromeOnScroll";

const root = document.documentElement;
let frames: FrameRequestCallback[] = [];

/** Scrolls, then paints the frame the rAF-throttled handler queued. */
function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
  const queued = frames;
  frames = [];
  queued.forEach((cb) => cb(0));
}

const chrome = () => root.dataset.scrollChrome;

beforeEach(() => {
  frames = [];
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  Object.defineProperty(root, "scrollHeight", { configurable: true, value: 5000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  delete root.dataset.cookieBanner;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete root.dataset.scrollChrome;
});

describe("useHideChromeOnScroll", () => {
  it("hides on scroll down and shows again on scroll up", () => {
    renderHook(() => useHideChromeOnScroll(true, "/en/job-seeker"));
    scrollTo(300);
    expect(chrome()).toBe("hidden");
    scrollTo(250);
    expect(chrome()).toBeUndefined();
  });

  it("ignores jitter smaller than the tolerance", () => {
    renderHook(() => useHideChromeOnScroll(true, "/en/job-seeker"));
    scrollTo(300);
    scrollTo(296);
    expect(chrome()).toBe("hidden");
  });

  it("always shows near the top of the page", () => {
    renderHook(() => useHideChromeOnScroll(true, "/en/job-seeker"));
    scrollTo(300);
    scrollTo(40);
    expect(chrome()).toBeUndefined();
  });

  it("treats rubber-banding past the bottom as no movement", () => {
    renderHook(() => useHideChromeOnScroll(true, "/en/job-seeker"));
    scrollTo(4200);
    expect(chrome()).toBe("hidden");
    scrollTo(4260); // overscroll beyond maxY (4200)
    scrollTo(4200); // bounce back
    expect(chrome()).toBe("hidden");
  });

  it("keeps the bars while the cookie banner is stacked on them", () => {
    root.dataset.cookieBanner = "visible";
    renderHook(() => useHideChromeOnScroll(true, "/en/job-seeker"));
    scrollTo(300);
    expect(chrome()).toBeUndefined();
  });

  it("does nothing when disabled", () => {
    renderHook(() => useHideChromeOnScroll(false, "/en/employer"));
    scrollTo(300);
    expect(chrome()).toBeUndefined();
  });

  it("shows the bars again on a new page and on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ path }) => useHideChromeOnScroll(true, path),
      { initialProps: { path: "/en/job-seeker" } }
    );
    scrollTo(300);
    expect(chrome()).toBe("hidden");
    rerender({ path: "/en/job-seeker/applications" });
    expect(chrome()).toBeUndefined();

    scrollTo(600);
    expect(chrome()).toBe("hidden");
    unmount();
    expect(chrome()).toBeUndefined();
  });
});
