/**
 * @jest-environment jsdom
 *
 * LinkedIn and Apple sign-in leave the site, and the provider's callback carries
 * no page of ours. The language of the page the visitor started from therefore
 * rides in the callback URL (`...post-login-redirect?locale=ar`), because a
 * visitor who refused display settings has no NEXT_LOCALE cookie to fall back
 * on. Both pages build that URL with the same helper; the register page used to
 * send plain /api/auth/post-login-redirect whenever there was no callback.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let mockLocale = "ar";
let mockSearch = "";
const signIn = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: jest.fn(),
  preloadGoogleSignIn: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({ locale: mockLocale }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
// A stable `ask` (as in the real hook) that agrees to the Terms & Privacy dialog.
const askSignupConsent = jest.fn().mockResolvedValue(true);
jest.mock("@/components/features/auth/SignupConsentDialog", () => ({
  useSignupConsentPrompt: () => ({ ask: askSignupConsent, dialog: null }),
}));

import LoginPage from "@/app/[locale]/(auth)/login/page";
import RegisterPage from "@/app/[locale]/(auth)/register/page";

/** The page the visitor is on, as the browser sees it (login reads window.location). */
function visit(path: string) {
  window.history.pushState({}, "", path);
  mockSearch = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
}

beforeEach(() => {
  jest.clearAllMocks();
  askSignupConsent.mockResolvedValue(true);
  signIn.mockResolvedValue(undefined);
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

describe("login: LinkedIn and Apple carry the page language", () => {
  const providers = [
    ["linkedin", "Continue with LinkedIn"],
    ["apple", "Continue with Apple"],
  ] as const;

  describe.each(providers)("%s", (provider, label) => {
    it("adds locale=ar on an /ar page with no callback", () => {
      mockLocale = "ar";
      visit("/ar/login");
      render(<LoginPage />);
      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(signIn).toHaveBeenCalledWith(provider, { callbackUrl: "/api/auth/post-login-redirect?locale=ar" });
    });

    it("adds locale=en on an /en page", () => {
      mockLocale = "en";
      visit("/en/login");
      render(<LoginPage />);
      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(signIn).toHaveBeenCalledWith(provider, { callbackUrl: "/api/auth/post-login-redirect?locale=en" });
    });

    it("keeps the callback and adds the locale after it", () => {
      mockLocale = "ar";
      visit("/ar/login?callbackUrl=%2Far%2Fjobs%2Fabc");
      render(<LoginPage />);
      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(signIn).toHaveBeenCalledWith(provider, {
        callbackUrl: "/api/auth/post-login-redirect?callbackUrl=%2Far%2Fjobs%2Fabc&locale=ar",
      });
    });
  });

  it("carries the locale when the page sends the visitor back through the provider after the Terms prompt", async () => {
    mockLocale = "ar";
    visit("/ar/login?error=consent_required&provider=linkedin");
    render(<LoginPage />);

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("linkedin", { callbackUrl: "/api/auth/post-login-redirect?locale=ar" });
  });
});

describe("register: LinkedIn and Apple carry the page language", () => {
  async function chooseJobSeeker() {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText("Find a job"));
  }

  describe.each([
    ["linkedin", "LinkedIn"],
    ["apple", "Apple"],
  ] as const)("%s", (provider, label) => {
    it("adds locale=ar on /ar/register with no callback (it used to send the plain URL)", async () => {
      mockLocale = "ar";
      visit("/ar/register");
      await chooseJobSeeker();
      fireEvent.click(screen.getByRole("button", { name: label }));

      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(signIn).toHaveBeenCalledWith(provider, { callbackUrl: "/api/auth/post-login-redirect?locale=ar" });
    });

    it("adds locale=en on /en/register", async () => {
      mockLocale = "en";
      visit("/en/register");
      await chooseJobSeeker();
      fireEvent.click(screen.getByRole("button", { name: label }));

      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(signIn).toHaveBeenCalledWith(provider, { callbackUrl: "/api/auth/post-login-redirect?locale=en" });
    });

    it("keeps the callback and adds the locale after it", async () => {
      mockLocale = "ar";
      visit("/ar/register?callbackUrl=%2Far%2Fjobs%2Fabc");
      await chooseJobSeeker();
      fireEvent.click(screen.getByRole("button", { name: label }));

      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
      expect(signIn).toHaveBeenCalledWith(provider, {
        callbackUrl: "/api/auth/post-login-redirect?callbackUrl=%2Far%2Fjobs%2Fabc&locale=ar",
      });
    });
  });
});
