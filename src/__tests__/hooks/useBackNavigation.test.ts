/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useBackNavigation } from "@/hooks/useBackNavigation";

const back = jest.fn();
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ back, push }),
}));

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, "length", {
    configurable: true,
    value: length,
  });
}

beforeEach(() => {
  back.mockClear();
  push.mockClear();
});

describe("useBackNavigation", () => {
  it("pops history when the user navigated here from inside the app", () => {
    setHistoryLength(3);
    const { result } = renderHook(() => useBackNavigation("/en/job-seeker/settings"));

    act(() => result.current.goBack());

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("pushes the fallback when there is no previous entry to pop", () => {
    // A seeker opening the page straight from an email footer: back() would
    // leave the app entirely.
    setHistoryLength(1);
    const { result } = renderHook(() => useBackNavigation("/en/job-seeker/settings"));

    act(() => result.current.goBack());

    expect(push).toHaveBeenCalledWith("/en/job-seeker/settings");
    expect(back).not.toHaveBeenCalled();
  });

  it("never pushes the page it came from, so settings <-> notifications cannot loop", () => {
    // The original bug: notifications linked back to settings with a PUSH,
    // leaving [settings, notifications, settings]. Settings' own back button
    // then walked forward into notifications again.
    setHistoryLength(2);
    const { result } = renderHook(() => useBackNavigation("/en/job-seeker/settings"));

    act(() => result.current.goBack());

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});
