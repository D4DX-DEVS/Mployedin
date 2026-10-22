/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import LoginPage from "@/app/[locale]/(auth)/login/page";
import RegisterPage from "@/app/[locale]/(auth)/register/page";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: jest.fn(),
  preloadGoogleSignIn: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(""),
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

const COPY = "Cookies are turned off in your browser. Signing in needs them: turn them on for this site, then reload this page.";

function setCookieEnabled(value: boolean) {
  Object.defineProperty(window.navigator, "cookieEnabled", { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => null }) as unknown as typeof fetch;
});
afterEach(() => {
  delete (window.navigator as unknown as { cookieEnabled?: boolean }).cookieEnabled;
});

/**
 * Both forms end in a session cookie. With cookies off the visitor would type
 * a password, press the button and get a vague failure, so each page says what
 * is wrong above the form.
 */
describe("login page, cookies turned off", () => {
  it("shows the cookies-off notice above the form", () => {
    setCookieEnabled(false);
    render(<LoginPage />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(COPY);
    const form = document.querySelector("form") as HTMLFormElement;
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says nothing when cookies are on", () => {
    setCookieEnabled(true);
    render(<LoginPage />);
    expect(screen.queryByText(COPY)).not.toBeInTheDocument();
  });

  it("leaves the form usable (the notice informs, it does not block)", () => {
    setCookieEnabled(false);
    render(<LoginPage />);
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });
});

describe("register page, cookies turned off", () => {
  function openForm() {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText("Find a job"));
  }

  it("shows the cookies-off notice above the sign-up form", () => {
    setCookieEnabled(false);
    openForm();

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(COPY);
    const form = document.querySelector("form") as HTMLFormElement;
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says nothing when cookies are on", () => {
    setCookieEnabled(true);
    openForm();
    expect(screen.queryByText(COPY)).not.toBeInTheDocument();
  });
});
