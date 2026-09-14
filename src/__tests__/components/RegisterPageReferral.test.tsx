/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const replace = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(search),
}));
const signIn = jest.fn().mockResolvedValue({ error: null });
jest.mock("next-auth/react", () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  getSession: jest.fn().mockResolvedValue({ user: { role: "job_seeker", isOnboarded: false } }),
}));
jest.mock("firebase/auth", () => ({
  signInWithPopup: jest.fn().mockResolvedValue({ user: { getIdToken: async () => "id-token" } }),
}));
jest.mock("@/lib/firebase/client", () => ({ firebaseAuth: {}, googleProvider: {} }));
jest.mock("next/link", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import RegisterPage from "@/app/[locale]/(auth)/register/page";

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  document.cookie = "mpl_ref=; Max-Age=0; Path=/";
  global.fetch = fetchMock as unknown as typeof fetch;
});

function validateResponds(body: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).startsWith("/api/referral/validate")
      ? { ok: true, json: async () => body }
      : { ok: true, json: async () => ({ success: true }) },
  );
}

// The next-intl mock renders the real English copy, so the queries below use
// the strings from messages/en.json → auth.
async function openForm() {
  render(<RegisterPage />);
  fireEvent.click(screen.getByText("Find a job"));
}

describe("/register?ref= (job seeker)", () => {
  it("shows the notice, sets the cookie and sends the code with the email form", async () => {
    search = "ref=MPL-1A2B3C4D5E6F7A8B";
    validateResponds({ valid: true, audience: "job_seeker" });
    await openForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    expect(document.cookie).toContain("mpl_ref=MPL-1A2B3C4D5E6F7A8B");

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "sara@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Passw0rd#2026" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "Str0ng!Passw0rd#2026" } });
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/job-seeker-register", expect.anything()),
    );
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/auth/job-seeker-register")!;
    expect(JSON.parse(call[1].body)).toMatchObject({ referralCode: "MPL-1A2B3C4D5E6F7A8B" });
  });

  it("passes the code to the Google popup sign-in", async () => {
    search = "ref=MPL-1A2B3C4D5E6F7A8B";
    validateResponds({ valid: true, audience: "job_seeker" });
    await openForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "firebase",
        expect.objectContaining({ idToken: "id-token", referralCode: "MPL-1A2B3C4D5E6F7A8B" }),
      ),
    );
  });

  it("explains an employer link and sets nothing", async () => {
    search = "ref=MPL-1A2B3C4D5E6F7A8B";
    validateResponds({ valid: true, audience: "employer" });
    await openForm();
    await waitFor(() =>
      expect(
        screen.getByText("This link is for employers. You can still create a job-seeker account."),
      ).toBeInTheDocument(),
    );
    expect(document.cookie).not.toContain("mpl_ref=MPL");
  });

  it("ignores a malformed ref without calling validate", async () => {
    search = "ref=<script>";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await openForm();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/referral/validate"));
    expect(screen.queryByTestId("referral-notice")).toBeNull();
  });
});
