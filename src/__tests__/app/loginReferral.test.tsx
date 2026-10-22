/**
 * @jest-environment jsdom
 *
 * A referral code reaching a sign-up through the LOGIN page (job page ->
 * "Sign in" -> LinkedIn / Apple creates a job seeker). Nothing is stored on
 * arrival: the code is read from page memory (pendingReferral) at the click, or
 * from the consent_required bounce URL, and goes into the post-login-redirect
 * URL and, at the Terms tick, into mpl_signup_consent.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import LoginPage from "@/app/[locale]/(auth)/login/page";
import { clearPendingReferral, getPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

const CODE = "MPL-1A2B3C4D5E6F7A8B";

const signInMock = jest.fn();
const getSessionMock = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));
const getGoogleIdToken = jest.fn();
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: (...args: unknown[]) => getGoogleIdToken(...args),
  preloadGoogleSignIn: jest.fn(),
}));
// jsdom cannot navigate; the real helper does location.replace.
const navigateWithPageLoad = jest.fn();
jest.mock("@/lib/browser/navigateWithPageLoad", () => ({
  navigateWithPageLoad: (...args: unknown[]) => navigateWithPageLoad(...args),
}));
const routerReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: routerReplace, refresh: jest.fn() }),
  useParams: () => ({ locale: "en" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// A stable callback, as in the real hook (a fresh mock per render would re-run the page's mount effect).
const askSignupConsent = jest.fn();
jest.mock("@/components/features/auth/SignupConsentDialog", () => ({
  useSignupConsentPrompt: () => ({ ask: askSignupConsent, dialog: null }),
}));

function openLogin(search = "") {
  window.history.replaceState(null, "", `/en/login${search}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  signInMock.mockResolvedValue({ error: null });
  getSessionMock.mockResolvedValue({ user: { role: "job_seeker", isOnboarded: true } });
  getGoogleIdToken.mockResolvedValue("id-token");
  askSignupConsent.mockResolvedValue(true);
  document.cookie = "mpl_signup_consent=; Max-Age=0; Path=/";
  clearPendingReferral();
  openLogin();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

const linkedIn = () => screen.getByRole("button", { name: /LinkedIn/ });
const apple = () => screen.getByRole("button", { name: /Apple/ });
const registerLink = () => document.querySelector<HTMLAnchorElement>('a[href^="/en/register"]');

describe("login: LinkedIn / Apple starts carry the code held in memory", () => {
  it.each([
    ["linkedin", linkedIn],
    ["apple", apple],
  ] as const)("%s start puts ref in the post-login-redirect URL", (provider, button) => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    fireEvent.click(button());
    expect(signInMock).toHaveBeenCalledWith(provider, {
      callbackUrl: `/api/auth/post-login-redirect?locale=en&ref=${CODE}`,
    });
  });

  it("keeps a callbackUrl next to the code", () => {
    setPendingReferral(CODE);
    openLogin("?callbackUrl=%2Fen%2Fjobs%2Fabc");
    render(<LoginPage />);
    fireEvent.click(linkedIn());
    expect(signInMock).toHaveBeenCalledWith("linkedin", {
      callbackUrl: `/api/auth/post-login-redirect?callbackUrl=%2Fen%2Fjobs%2Fabc&locale=en&ref=${CODE}`,
    });
  });

  it("is exactly the old URL when nothing is held", () => {
    render(<LoginPage />);
    fireEvent.click(linkedIn());
    expect(signInMock).toHaveBeenCalledWith("linkedin", { callbackUrl: "/api/auth/post-login-redirect?locale=en" });
  });

  it("writes no cookie at this click: a returning user needs no tick, a new one is bounced and asked", () => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    fireEvent.click(linkedIn());
    expect(document.cookie).not.toContain("mpl_signup_consent");
    expect(document.cookie).not.toContain("MPL-");
  });
});

describe("login: Google sign-in carries the code held in memory", () => {
  const google = () => screen.getByRole("button", { name: "Continue with Google" });

  it("passes it as the referralCode credential, as the register page does", async () => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    await act(async () => {
      fireEvent.click(google());
    });
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith("firebase", { idToken: "id-token", referralCode: CODE, redirect: false });
    // Signed in: the held code has no more use.
    await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
    expect(getPendingReferral()).toBe("");
  });

  it("sends exactly the old credentials when nothing is held", async () => {
    render(<LoginPage />);
    await act(async () => {
      fireEvent.click(google());
    });
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith("firebase", { idToken: "id-token", redirect: false });
  });

  it("keeps it on the retry after the Terms tick", async () => {
    setPendingReferral(CODE);
    signInMock
      .mockResolvedValueOnce({ error: "CredentialsSignin", code: "consent_required" })
      .mockResolvedValueOnce({ error: null });
    render(<LoginPage />);
    await act(async () => {
      fireEvent.click(google());
    });
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(2));
    expect(askSignupConsent).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenNthCalledWith(1, "firebase", { idToken: "id-token", referralCode: CODE, redirect: false });
    expect(signInMock).toHaveBeenNthCalledWith(
      2,
      "firebase",
      expect.objectContaining({ idToken: "id-token", referralCode: CODE, termsAccepted: "true", redirect: false }),
    );
  });

  it("writes no cookie or storage for the code", async () => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    await act(async () => {
      fireEvent.click(google());
    });
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(document.cookie).not.toContain("MPL-");
    expect(JSON.stringify({ ...localStorage })).not.toContain("MPL-");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("MPL-");
  });
});

describe("login: the Register link follows the code", () => {
  it("carries it", () => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    expect(registerLink()?.getAttribute("href")).toBe(`/en/register?ref=${CODE}`);
  });

  it("carries it next to a callbackUrl", async () => {
    setPendingReferral(CODE);
    openLogin("?callbackUrl=%2Fen%2Fjobs%2Fabc");
    render(<LoginPage />);
    await waitFor(() =>
      expect(registerLink()?.getAttribute("href")).toBe(`/en/register?ref=${CODE}&callbackUrl=%2Fen%2Fjobs%2Fabc`),
    );
  });

  it("is the plain register page without a code", () => {
    render(<LoginPage />);
    expect(registerLink()?.getAttribute("href")).toBe("/en/register");
  });
});

describe("login: the consent_required bounce", () => {
  it("reads ref, asks for the tick, writes it into mpl_signup_consent and retries with it in the URL", async () => {
    openLogin(`?error=consent_required&provider=linkedin&ref=${CODE}`);
    render(<LoginPage />);

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(askSignupConsent).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith("linkedin", {
      callbackUrl: `/api/auth/post-login-redirect?locale=en&ref=${CODE}`,
    });
    expect(document.cookie).toContain(`mpl_signup_consent=terms~${CODE}`);
    expect(getPendingReferral()).toBe(CODE);
  });

  it("cleans the address bar after a tick (deferred, all params as before)", async () => {
    openLogin(`?error=consent_required&provider=apple&ref=${CODE}`);
    render(<LoginPage />);
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith("apple", expect.anything()));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/en/login");
  });

  it("works the old way when the bounce carries no code", async () => {
    openLogin("?error=consent_required&provider=linkedin");
    render(<LoginPage />);
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith("linkedin", { callbackUrl: "/api/auth/post-login-redirect?locale=en" });
    expect(document.cookie).toContain("mpl_signup_consent=terms");
    expect(document.cookie).not.toContain("MPL-");
  });

  it("ignores a malformed code in the bounce", async () => {
    openLogin("?error=consent_required&provider=linkedin&ref=%3Cscript%3E");
    render(<LoginPage />);
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith("linkedin", { callbackUrl: "/api/auth/post-login-redirect?locale=en" });
    expect(document.cookie).not.toContain("MPL-");
    expect(getPendingReferral()).toBe("");
  });

  it("writes nothing and does not sign in when the tick is refused", async () => {
    askSignupConsent.mockResolvedValue(false);
    openLogin(`?error=consent_required&provider=linkedin&ref=${CODE}`);
    render(<LoginPage />);
    await waitFor(() => expect(askSignupConsent).toHaveBeenCalled());
    await act(async () => {});
    expect(signInMock).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("mpl_signup_consent");
  });
});

describe("login: the code is forgotten after sign-in", () => {
  it("clears the held code once the password sign-in worked", async () => {
    setPendingReferral(CODE);
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/, { selector: "input" }), { target: { value: "secret-pass" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(getPendingReferral()).toBe("");
  });
});
