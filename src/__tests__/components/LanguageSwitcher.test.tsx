/**
 * @jest-environment jsdom
 *
 * NEXT_LOCALE is a preference cookie: the switcher writes it only while
 * preferences are allowed (no choice yet, or accepted), never after an
 * objection. Switching language itself always works — the URL carries it, and
 * the account setting is saved either way.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { writeConsent } from "@/lib/consent/client";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/en/employer/jobs",
  useRouter: () => ({ push, refresh }),
}));

const fetchMock = jest.fn().mockResolvedValue({ ok: true });

function clearCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

function switchToArabic() {
  render(<LanguageSwitcher />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to Arabic" }));
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

/** Another tab changing the choice: the cookie changes, but no event reaches this tab. */
function changeChoiceInAnotherTab(preferences: boolean) {
  const stored = { v: 1, id: "other-tab", preferences, media: false, at: "2026-10-21T00:00:00.000Z" };
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(stored)}; Path=/`;
}

function clickArabic() {
  fireEvent.click(screen.getByRole("button", { name: "Switch to Arabic" }));
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  push.mockClear();
  refresh.mockClear();
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  clearCookies();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("LanguageSwitcher", () => {
  it("remembers the language in NEXT_LOCALE while preferences are allowed (no choice yet)", () => {
    switchToArabic();
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
    expect(push).toHaveBeenCalledWith("/ar/employer/jobs");
  });

  it("remembers it when preferences were accepted", () => {
    writeConsent({ preferences: true, media: false });
    switchToArabic();
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
    expect(push).toHaveBeenCalledWith("/ar/employer/jobs");
  });

  it("writes no cookie after the visitor objected to preferences, but still switches language", () => {
    writeConsent({ preferences: false, media: false });
    switchToArabic();
    expect(document.cookie).not.toContain("NEXT_LOCALE");
    expect(push).toHaveBeenCalledWith("/ar/employer/jobs");
    expect(refresh).toHaveBeenCalled();
  });

  it("still saves the language to the account either way", () => {
    writeConsent({ preferences: false, media: false });
    switchToArabic();
    expect(fetchMock).toHaveBeenCalledWith("/api/users/locale", expect.objectContaining({ method: "PATCH" }));
  });

  it("respects an objection made in another tab after this one mounted (cookie changed, no event)", () => {
    render(<LanguageSwitcher />); // no choice yet: preferences were allowed at mount
    changeChoiceInAnotherTab(false);
    clickArabic();
    expect(document.cookie).not.toContain("NEXT_LOCALE");
    expect(push).toHaveBeenCalledWith("/ar/employer/jobs");
  });

  it("respects an acceptance made in another tab after this one mounted with an objection", () => {
    writeConsent({ preferences: false, media: false });
    render(<LanguageSwitcher />);
    changeChoiceInAnotherTab(true);
    clickArabic();
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
  });
});
