/**
 * @jest-environment jsdom
 *
 * An agent added by an admin or super-agent is sent here by the proxy with no
 * code ever issued, while the page says "we sent a code" — the first email only
 * came after pressing Resend (reported 2026-09-25). Arriving without a link
 * token must ask for a code once; the server skips it when a live one exists.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated", update: jest.fn(async () => null) }),
  signOut: jest.fn(),
}));

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));

let query = "email=agent@mployedin.com";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(query),
}));

import VerifyEmailPage from "@/app/[locale]/(auth)/verify-email/page";

const fetchMock = jest.fn();
const resendCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/auth/resend-verification"));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

it("asks for a code once on arrival, only if none is live", async () => {
  query = "email=agent@mployedin.com";
  const { rerender } = render(<VerifyEmailPage />);
  await waitFor(() => expect(resendCalls()).toHaveLength(1));
  expect(JSON.parse(resendCalls()[0][1].body)).toEqual({ email: "agent@mployedin.com", ifMissing: true });
  rerender(<VerifyEmailPage />);
  expect(resendCalls()).toHaveLength(1);
  // Nothing claims a fresh send — the server may have kept the existing code.
  expect(screen.queryByText("resendSuccess")).not.toBeInTheDocument();
});

it("shows the error and frees Resend when that send fails", async () => {
  query = "email=agent@mployedin.com";
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Couldn't send the email right now." }) });
  render(<VerifyEmailPage />);
  expect(await screen.findByText("Couldn't send the email right now.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /resendVerificationEmail/ })).toBeEnabled();
});

it("does not ask when arriving from a verification link", async () => {
  query = "token=abc123&email=agent@mployedin.com";
  render(<VerifyEmailPage />);
  expect(await screen.findByText("verifiedTitle")).toBeInTheDocument();
  expect(resendCalls()).toHaveLength(0);
});
