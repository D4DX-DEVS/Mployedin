/**
 * @jest-environment jsdom
 *
 * The Google buttons on the login and register pages. Firebase is loaded by
 * the helper only when the button is clicked; hovering, focusing or touching
 * it may warm our own JS chunk but must never start Firebase. A short notice
 * under the buttons says a Google window opens.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getGoogleIdToken = jest.fn();
const preloadGoogleSignIn = jest.fn();
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: (...args: unknown[]) => getGoogleIdToken(...args),
  preloadGoogleSignIn: (...args: unknown[]) => preloadGoogleSignIn(...args),
}));

const signIn = jest.fn();
const getSession = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  getSession: (...args: unknown[]) => getSession(...args),
}));
const navigateWithPageLoad = jest.fn();
jest.mock("@/lib/browser/navigateWithPageLoad", () => ({
  navigateWithPageLoad: (...args: unknown[]) => navigateWithPageLoad(...args),
}));
const replace = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => mockSearchParams,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("@/components/features/auth/SignupConsentDialog", () => ({
  useSignupConsentPrompt: () => ({ ask: jest.fn(), dialog: null }),
}));

import LoginPage from "@/app/[locale]/(auth)/login/page";
import RegisterPage from "@/app/[locale]/(auth)/register/page";
import { GooglePopupBlockedError } from "@/lib/firebase/googlePopupBlocked";

const NOTICE = "Continue with Google opens a Google window";

/** The line under the button: its text is the notice, or the blocked message. */
const noticeLine = () => document.getElementById("google-window-notice") as HTMLElement;
/**
 * The Google notice's own live region. Not "the first polite region on the
 * page": the register form's password checklist is a live region too.
 */
const announcer = () => document.getElementById("google-window-announcer");
/** What the Google notice tells a screen reader. */
const announced = () => announcer()?.textContent ?? "";

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  getGoogleIdToken.mockResolvedValue("id-token");
  signIn.mockResolvedValue({ error: null });
  getSession.mockResolvedValue({ user: { role: "job_seeker", isOnboarded: true } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

const cases: Array<{
  name: string;
  open: () => HTMLElement;
}> = [
  {
    name: "login",
    open: () => {
      render(<LoginPage />);
      return screen.getByRole("button", { name: "Continue with Google" });
    },
  },
  {
    name: "register",
    open: () => {
      render(<RegisterPage />);
      fireEvent.click(screen.getByText("Find a job"));
      return screen.getByRole("button", { name: "Google" });
    },
  },
];

describe.each(cases)("$name page Google button", ({ open }) => {
  it("does not start Firebase or warm anything just by rendering", () => {
    open();

    expect(getGoogleIdToken).not.toHaveBeenCalled();
    expect(preloadGoogleSignIn).not.toHaveBeenCalled();
  });

  it("warms our own chunk on hover, focus and touch, and never starts the sign-in", () => {
    const button = open();

    fireEvent.pointerEnter(button);
    expect(preloadGoogleSignIn).toHaveBeenCalledTimes(1);
    fireEvent.focus(button);
    expect(preloadGoogleSignIn).toHaveBeenCalledTimes(2);
    fireEvent.touchStart(button);
    expect(preloadGoogleSignIn).toHaveBeenCalledTimes(3);

    expect(getGoogleIdToken).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("gets the Google token through the helper on click and exchanges it for a session", async () => {
    const button = open();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(getGoogleIdToken).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("firebase", expect.objectContaining({ idToken: "id-token", redirect: false })),
    );
  });

  // The popup resolver keeps a hidden Google iframe and window.gapi for the life
  // of the document, and deleting the Firebase app does not remove them. A full
  // page load after a successful sign-in is what drops them for the dashboard.
  it("leaves with a full page load after a successful sign-in, not a client-side navigation", async () => {
    const button = open();

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/job-seeker");
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not leave the page when the sign-in did not succeed", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    const button = open();

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(navigateWithPageLoad).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("tells the visitor a Google window opens, and ties the notice to the button", () => {
    const button = open();

    const notice = screen.getByText(NOTICE);
    expect(notice).toBeInTheDocument();
    expect(notice.id).not.toBe("");
    expect(button.getAttribute("aria-describedby")).toBe(notice.id);
  });

  it("does not announce the neutral notice: the live region is in the page, but empty", () => {
    open();

    expect(announced()).toBe("");
    expect(screen.getByText(NOTICE)).not.toHaveAttribute("aria-live");
    expect(screen.getByText(NOTICE)).not.toHaveAttribute("aria-hidden");
  });
});

/**
 * Safari can block the Google window when Firebase's handshake (which now starts
 * at the click) outlasts the short user-activation window. The helper keeps the
 * handshake and throws GooglePopupBlockedError: the page says so next to the
 * button (inline, not a toast), asks to press the button again, and clears that
 * on the next click.
 */
const BLOCKED = "Your browser blocked the Google window. Press the Google button again.";

/** The blocked message is on the line under the button and is what the live region announces. */
async function expectBlockedMessage(): Promise<void> {
  await waitFor(() => expect(noticeLine()).toHaveTextContent(BLOCKED));
  expect(announced()).toBe(BLOCKED);
}

describe.each(cases)("$name page: the browser blocked the Google window", ({ open }) => {
  it("says so inline next to the button, in place of the notice, and does not call it an error", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
    const button = open();
    // A screen reader only announces text added to a live region it already knows about.
    const region = announcer();
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    await act(async () => {
      fireEvent.click(button);
    });

    await expectBlockedMessage();
    expect(announcer()).toBe(region);
    const message = noticeLine();
    expect(message.id).not.toBe("");
    expect(button.getAttribute("aria-describedby")).toBe(message.id);
    // The visible line is not read a second time.
    expect(message).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(NOTICE)).toBeNull();
    // Not the form-level error box, and not logged.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    // The button is usable again for the retry.
    expect(button).toBeEnabled();
    consoleError.mockRestore();
  });

  it("clears the message on the next click and calls the helper again", async () => {
    getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
    const button = open();
    await act(async () => {
      fireEvent.click(button);
    });
    await expectBlockedMessage();

    // The retry is still waiting on Google: the old message must already be gone.
    getGoogleIdToken.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(button);
    });

    expect(getGoogleIdToken).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(announced()).toBe("");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("a retry that succeeds clears the message and signs in", async () => {
    getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
    const button = open();
    await act(async () => {
      fireEvent.click(button);
    });
    await expectBlockedMessage();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.queryByText(BLOCKED)).toBeNull();
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("firebase", expect.objectContaining({ idToken: "id-token", redirect: false })),
    );
  });
});

/**
 * "Press again" is right once. The helper hands back the Firebase error itself
 * (code auth/popup-blocked, not a GooglePopupBlockedError) when the retry, which
 * runs on the kept instance after the handshake finished, is still blocked: the
 * browser really blocks pop-ups, and repeating "press again" would loop for
 * ever. The page then gives the existing allow-pop-ups guidance.
 */
const ALLOW_POPUPS = "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";

describe.each(cases)("$name page: the browser blocks the Google window on the retry too", ({ open }) => {
  const realBlocker = () => Object.assign(new Error("Firebase: Error (auth/popup-blocked)."), { code: "auth/popup-blocked" });

  it("replaces \"press again\" with the allow-pop-ups guidance", async () => {
    getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
    const button = open();
    await act(async () => {
      fireEvent.click(button);
    });
    await expectBlockedMessage();

    getGoogleIdToken.mockRejectedValueOnce(realBlocker());
    await act(async () => {
      fireEvent.click(button);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(ALLOW_POPUPS);
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(navigateWithPageLoad).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
  });

  it("goes back to \"press again\" if a later click is blocked on a fresh handshake, and a success then signs in", async () => {
    getGoogleIdToken
      .mockRejectedValueOnce(new GooglePopupBlockedError())
      .mockRejectedValueOnce(realBlocker())
      .mockRejectedValueOnce(new GooglePopupBlockedError());
    const button = open();
    for (let click = 0; click < 3; click += 1) {
      await act(async () => {
        fireEvent.click(button);
      });
    }
    await expectBlockedMessage();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.queryByText(BLOCKED)).toBeNull();
    await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
  });
});

/**
 * Closing the Google window, or starting another sign-in over it, is a choice:
 * no message, the button usable again. The codes and messages are the ones
 * Firebase really throws. Anything else is still a failure the visitor is told about.
 */
const FAILED = "Google sign-in failed. Please try again.";

describe.each(cases)("$name page: closing the Google window", ({ open }) => {
  const firebaseError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

  it.each(["auth/popup-closed-by-user", "auth/cancelled-popup-request"])(
    "says nothing when Firebase reports %s, and the button is usable again",
    async (code) => {
      getGoogleIdToken.mockRejectedValue(firebaseError(code));
      const button = open();

      await act(async () => {
        fireEvent.click(button);
      });

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText(FAILED)).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
      expect(announced()).toBe("");
      expect(button).toBeEnabled();
    },
  );

  it("still reports any other failure", async () => {
    getGoogleIdToken.mockRejectedValue(firebaseError("auth/network-request-failed"));
    const button = open();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
  });
});

/**
 * Where a successful Google sign-in goes next. The register page has three
 * destinations: the callback the visitor came from, onboarding for an account
 * that has not finished it, and the home of the account's role. Each leaves with
 * a full page load (Firebase's popup resolver leaves a hidden iframe and
 * window.gapi that only a page load drops).
 */
describe("register page: where a successful Google sign-in goes", () => {
  async function signInWithGoogle(): Promise<void> {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText("Find a job"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Google" }));
    });
    await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
  }

  it("goes back to the page the visitor came from when there is a safe callback", async () => {
    mockSearchParams = new URLSearchParams({ callbackUrl: "/en/jobs/abc?tab=apply" });

    await signInWithGoogle();

    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/jobs/abc?tab=apply");
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores a callback that leaves the site, and goes to the role's home", async () => {
    mockSearchParams = new URLSearchParams({ callbackUrl: "https://evil.example/en/jobs" });

    await signInWithGoogle();

    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/job-seeker");
  });

  it("goes to onboarding when the account has not finished it", async () => {
    getSession.mockResolvedValue({ user: { role: "job_seeker", isOnboarded: false } });

    await signInWithGoogle();

    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/onboarding");
  });

  it("onboarding wins over the home of the role, but not over a callback", async () => {
    getSession.mockResolvedValue({ user: { role: "employer", isOnboarded: false } });
    mockSearchParams = new URLSearchParams({ callbackUrl: "/en/jobs/abc" });

    await signInWithGoogle();

    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/jobs/abc");
  });

  it("goes to the home of the account's role once onboarded", async () => {
    getSession.mockResolvedValue({ user: { role: "employer", isOnboarded: true } });

    await signInWithGoogle();

    expect(navigateWithPageLoad).toHaveBeenCalledWith("/en/employer");
  });
});

describe("login page: where a successful Google sign-in goes", () => {
  it("goes to onboarding when the account has not finished it", async () => {
    getSession.mockResolvedValue({ user: { role: "job_seeker", isOnboarded: false } });
    render(<LoginPage />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    });

    await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
    expect(navigateWithPageLoad.mock.calls[0][0]).toMatch(/onboarding/);
  });
});
