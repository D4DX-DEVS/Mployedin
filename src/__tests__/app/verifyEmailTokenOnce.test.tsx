/**
 * @jest-environment jsdom
 *
 * Clicking the verification link verified the address, then showed "link
 * expired": the success path calls updateSession(), useSession hands back a new
 * `update` function, the effect re-ran and POSTed the now-spent token again,
 * and the 400 replaced the success screen (audit 2026-09-24, ONB-15).
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  // A fresh `update` on every render — what next-auth does after an update.
  useSession: () => ({ data: null, status: "unauthenticated", update: jest.fn(async () => null) }),
  signOut: jest.fn(),
}));

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams("token=abc123&email=test@example.com"),
}));

import VerifyEmailPage from "@/app/[locale]/(auth)/verify-email/page";

it("verifies the token once and stays on the success screen", async () => {
  const fetchMock = jest.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => ({}) }));
  global.fetch = fetchMock as unknown as typeof fetch;

  render(<VerifyEmailPage />);

  expect(await screen.findByText("verifiedTitle")).toBeInTheDocument();
  const verifyCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/auth/verify-email"));
  expect(verifyCalls).toHaveLength(1);
  expect(screen.queryByText("verificationFailedTitle")).not.toBeInTheDocument();
});
