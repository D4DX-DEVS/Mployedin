/**
 * @jest-environment jsdom
 *
 * UI state that is a preference (a dismissed card, a remembered layout) lives
 * under a `ui:` name in prefStorage: on the device while preferences are
 * allowed, in the tab only after an objection. What an older build stored under
 * the unprefixed name is read once and moved.
 *
 * The temporary-password notice's dismissal is not a preference: its key holds
 * the user id, so it is kept in the tab (sessionStorage) whatever the visitor
 * chose about cookies. An old localStorage copy is deleted on page load (see
 * CookieConsent.test.tsx), not carried over.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SetupGuide } from "@/components/features/employer/SetupGuide";
import { TemporaryPasswordNotice } from "@/components/shared/TemporaryPasswordNotice";
import { writeConsent } from "@/lib/consent/client";

jest.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1", email: "me@example.com" } } }),
}));
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));

const fetchMock = jest.fn();

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "mpl_consent=; Max-Age=0; path=/";
  fetchMock.mockReset();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

function setupStatus() {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ steps: [{ id: "profile", href: "/employer/profile", completed: false }], allDone: false }),
  });
}

describe("SetupGuide dismissal", () => {
  it("stays dismissed when an older build stored the dismissal under the old name, and renames it", async () => {
    localStorage.setItem("mployedin:setup-guide:dismissed", "true");
    setupStatus();

    render(<SetupGuide />);

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("mployedin:setup-guide:dismissed")).toBeNull();
    expect(localStorage.getItem("ui:mployedin:setup-guide:dismissed")).toBe("true");
  });

  it("remembers 'do not show again' on the device while preferences are allowed", async () => {
    setupStatus();
    render(<SetupGuide />);
    fireEvent.click(await screen.findByLabelText(/do not show again/i));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(localStorage.getItem("ui:mployedin:setup-guide:dismissed")).toBe("true");
  });

  it("remembers it for the tab only after preferences were objected to", async () => {
    writeConsent({ preferences: false, media: false });
    setupStatus();
    render(<SetupGuide />);
    fireEvent.click(await screen.findByLabelText(/do not show again/i));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(localStorage.getItem("ui:mployedin:setup-guide:dismissed")).toBeNull();
    expect(sessionStorage.getItem("ui:mployedin:setup-guide:dismissed")).toBe("true");
  });
});

describe("TemporaryPasswordNotice dismissal", () => {
  const KEY = "mployedin:temp-password-notice-dismissed:u1";
  const passwordStatus = () =>
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ temporaryPassword: true }) });

  it("remembers a dismissal for the tab only, even while preferences are allowed", async () => {
    passwordStatus();
    render(<TemporaryPasswordNotice />);

    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));

    await waitFor(() => expect(sessionStorage.getItem(KEY)).toBe("1"));
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("remembers it for the tab only after preferences were objected to, too", async () => {
    writeConsent({ preferences: false, media: false });
    passwordStatus();
    render(<TemporaryPasswordNotice />);

    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));

    await waitFor(() => expect(sessionStorage.getItem(KEY)).toBe("1"));
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("stays dismissed in this tab, and does not ask the server again", async () => {
    sessionStorage.setItem(KEY, "1");
    passwordStatus();

    render(<TemporaryPasswordNotice />);

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not read a dismissal an older build left in localStorage (it is deleted on page load instead)", async () => {
    localStorage.setItem(KEY, "1");
    passwordStatus();

    render(<TemporaryPasswordNotice />);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Neither moved to the tab nor removed here: that is the page-load sweep's job.
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("uses one key for the read and the write", async () => {
    passwordStatus();
    const { unmount } = render(<TemporaryPasswordNotice />);
    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(sessionStorage.getItem(KEY)).toBe("1"));
    unmount();
    fetchMock.mockClear();

    render(<TemporaryPasswordNotice />);

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
