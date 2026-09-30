/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import LoginPage from "@/app/[locale]/(auth)/login/page";

const signInMock = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  getSession: jest.fn().mockResolvedValue(null),
}));
jest.mock("firebase/auth", () => ({ signInWithPopup: jest.fn() }));
jest.mock("@/lib/firebase/client", () => ({ firebaseAuth: {}, googleProvider: {} }));
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
jest.mock("@/components/features/auth/SignupConsentDialog", () => ({
  useSignupConsentPrompt: () => ({ ask: jest.fn(), dialog: null }),
}));

/**
 * The login form used to leave empty or malformed input to the browser's own
 * bubble: English on the Arabic site, gone after a moment, and not tied to the
 * field for a screen reader. It now says what is wrong under the field, the
 * same way the register form does.
 */
describe("login form field errors", () => {
  beforeEach(() => {
    signInMock.mockReset();
    localStorage.clear();
  });

  async function submit() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });
  }

  it("explains an empty submit under each field and never calls the server", async () => {
    render(<LoginPage />);
    await submit();

    const email = screen.getByRole("textbox", { name: "Email address" });
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a password.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter your email address.");
    expect(email).toHaveFocus();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("flags a malformed email but not a filled-in password", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(/^Password/, { selector: "input" }), { target: { value: "secret" } });
    await submit();

    expect(screen.getByText("Enter a valid email address, like name@example.com.")).toBeInTheDocument();
    expect(screen.queryByText("Enter a password.")).not.toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as it is edited", async () => {
    render(<LoginPage />);
    await submit();
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: "a" } });

    expect(screen.queryByText("Enter your email address.")).not.toBeInTheDocument();
  });

  it("marks the required fields and says what the mark means, without a screen reader reading 'star'", () => {
    render(<LoginPage />);

    expect(screen.getByText("Fields marked * are required.")).toBeInTheDocument();
    const emailLabel = document.querySelector('label[for="email"]');
    expect(emailLabel?.querySelector('[aria-hidden="true"]')).toHaveTextContent("*");
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeRequired();
  });
});
