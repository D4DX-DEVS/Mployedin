/**
 * @jest-environment jsdom
 *
 * "Remember my email" is the one thing the login page keeps on the device, and
 * only because the person asked: ticked writes it, unticked removes it, and a
 * sign-in that never ticked it leaves nothing behind.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import LoginPage from "@/app/[locale]/(auth)/login/page";

const signInMock = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: jest.fn(),
  preloadGoogleSignIn: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
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
// `ask` is a stable callback in the real hook; a fresh mock per render would
// re-run the page's mount effect and re-tick the box after every click.
const askSignupConsent = jest.fn();
jest.mock("@/components/features/auth/SignupConsentDialog", () => ({
  useSignupConsentPrompt: () => ({ ask: askSignupConsent, dialog: null }),
}));

const KEY = "mployedin_remember_email";

describe("login: remember my email", () => {
  beforeEach(() => {
    signInMock.mockReset().mockResolvedValue({ error: "CredentialsSignin", code: "credentials" });
    localStorage.clear();
  });

  function fillCredentials(email = "me@example.com") {
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(/^Password/, { selector: "input" }), { target: { value: "secret-pass" } });
  }

  async function submit() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });
  }

  const checkbox = () => screen.getByRole("checkbox", { name: "Remember my email" });

  it("writes the email only when the box is ticked", async () => {
    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(checkbox());
    await submit();

    expect(localStorage.getItem(KEY)).toBe("me@example.com");
    expect(signInMock).toHaveBeenCalledWith("credentials", expect.objectContaining({ rememberMe: "true" }));
  });

  it("writes nothing when the box was never ticked", async () => {
    render(<LoginPage />);
    fillCredentials();
    await submit();

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
    expect(signInMock).toHaveBeenCalledWith("credentials", expect.objectContaining({ rememberMe: "false" }));
  });

  it("removes a remembered email when the box is unticked", async () => {
    localStorage.setItem(KEY, "me@example.com");
    render(<LoginPage />);
    // Coming back, the box is ticked and the email is filled in.
    expect(checkbox()).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveValue("me@example.com");

    fireEvent.click(checkbox());
    fillCredentials();
    await submit();

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not write anything just because the email was typed or the form was opened", () => {
    render(<LoginPage />);
    fillCredentials();

    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
