/**
 * @jest-environment jsdom
 *
 * An emailed "confirm" link opened where the account is not signed in now
 * needs the account's password (lib/auth/passwordHolder.ts). The pages ask for
 * it instead of failing: the link view shows a password step, and the code
 * form shows the field up front when nobody is signed in, so someone who has
 * just registered on this device lets the browser fill it in.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let sessionStatus: "authenticated" | "unauthenticated" = "unauthenticated";
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: sessionStatus, update: jest.fn(async () => null) }),
  signOut: jest.fn(),
}));
const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
let query = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(query),
}));

import VerifyEmailPage from "@/app/[locale]/(auth)/verify-email/page";
import ConfirmEmailChangePage from "@/app/[locale]/(auth)/confirm-email-change/page";

type Reply = { status: number; body: Record<string, unknown> };
let replies: Reply[] = [];
const fetchMock = jest.fn(async (url: unknown, _init?: RequestInit) => {
  if (String(url).includes("resend-verification")) return { ok: true, status: 200, json: async () => ({}) };
  const reply = replies.shift() ?? { status: 200, body: {} };
  return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
});
const bodiesTo = (path: string) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes(path))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

beforeEach(() => {
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  sessionStatus = "unauthenticated";
  replies = [];
});

const needsPassword: Reply = { status: 401, body: { code: "PASSWORD_REQUIRED", error: "Enter the account's password." } };

describe("verify-email link", () => {
  beforeEach(() => {
    query = "token=link-token&email=owner@example.org";
  });

  it("asks for the password, then confirms with it", async () => {
    replies = [needsPassword, { status: 200, body: {} }];
    render(<VerifyEmailPage />);

    expect(await screen.findByText("verifyTitle")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("passwordLabel"), { target: { value: "Str0ng!Passw0rd" } });
    fireEvent.click(screen.getByRole("button", { name: "verifySubmit" }));

    expect(await screen.findByText("verifiedTitle")).toBeInTheDocument();
    expect(bodiesTo("/api/auth/verify-email")[1]).toEqual({ token: "link-token", password: "Str0ng!Passw0rd" });
  });

  it("says so when the password is wrong, and stays on the step", async () => {
    replies = [needsPassword, { status: 401, body: { code: "WRONG_PASSWORD", error: "x" } }];
    render(<VerifyEmailPage />);

    fireEvent.change(await screen.findByLabelText("passwordLabel"), { target: { value: "guess" } });
    fireEvent.click(screen.getByRole("button", { name: "verifySubmit" }));

    expect(await screen.findByText("wrongPassword")).toBeInTheDocument();
    expect(screen.getByText("verifyTitle")).toBeInTheDocument();
  });

  it("offers a way out to someone who does not know the password", async () => {
    replies = [needsPassword];
    render(<VerifyEmailPage />);

    expect(await screen.findByText("verifyHelpIgnore")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "resetLink" })).toHaveAttribute("href", "/en/forgot-password");
    // A job seeker can also get in with a code (that removes a stranger's
    // password); an agent still waiting for approval can do neither.
    expect(screen.getByRole("link", { name: "codeLoginLink" })).toHaveAttribute("href", "/en/login");
    expect(screen.getByRole("link", { name: "contactSupport" })).toHaveAttribute("href", "/en/contact");
  });
});

describe("verify-email code form", () => {
  beforeEach(() => {
    query = "email=owner@example.org";
  });

  it("shows the password field when nobody is signed in, and sends it with the code", async () => {
    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText("otpPlaceholder"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("codePasswordLabel"), { target: { value: "Str0ng!Passw0rd" } });
    fireEvent.click(screen.getByRole("button", { name: "verifyCode" }));

    expect(await screen.findByText("verifiedTitle")).toBeInTheDocument();
    expect(bodiesTo("/api/auth/verify-email")[0]).toEqual({
      otp: "123456",
      email: "owner@example.org",
      password: "Str0ng!Passw0rd",
    });
  });

  it("explains a code that has been guessed at too often", async () => {
    replies = [{ status: 400, body: { code: "CODE_LOCKED", error: "x" } }];
    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByPlaceholderText("otpPlaceholder"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "verifyCode" }));

    expect(await screen.findByText("codeLocked")).toBeInTheDocument();
  });

  it("leaves it out inside a session, unless the server asks for it", async () => {
    sessionStatus = "authenticated";
    replies = [needsPassword];
    render(<VerifyEmailPage />);
    expect(screen.queryByLabelText("codePasswordLabel")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("otpPlaceholder"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "verifyCode" }));

    // Signed in as another account: the server wants the password after all.
    expect(await screen.findByLabelText("codePasswordLabel")).toBeInTheDocument();
    expect(bodiesTo("/api/auth/verify-email")[0]).toEqual({ otp: "123456", email: "owner@example.org" });
  });
});

describe("confirm-email-change link", () => {
  beforeEach(() => {
    query = "token=change-token";
  });

  it("asks for the password, then moves the address", async () => {
    replies = [needsPassword, { status: 200, body: { success: true, email: "new@example.org" } }];
    render(<ConfirmEmailChangePage />);

    expect(await screen.findByText("changeTitle")).toBeInTheDocument();
    expect(screen.getByText("changeHelpIgnore")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("passwordLabel"), { target: { value: "Str0ng!Passw0rd" } });
    fireEvent.click(screen.getByRole("button", { name: "changeSubmit" }));

    expect(await screen.findByText("emailUpdatedTitle")).toBeInTheDocument();
    await waitFor(() =>
      expect(bodiesTo("/api/auth/confirm-email-change")[1]).toEqual({ token: "change-token", password: "Str0ng!Passw0rd" }),
    );
  });
});
