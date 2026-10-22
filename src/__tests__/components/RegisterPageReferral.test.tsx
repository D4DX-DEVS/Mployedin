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
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: jest.fn().mockResolvedValue("id-token"),
  preloadGoogleSignIn: jest.fn(),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import RegisterPage from "@/app/[locale]/(auth)/register/page";
import { clearPendingReferral, getPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  document.cookie = "mpl_ref=; Max-Age=0; Path=/";
  document.cookie = "mpl_signup_consent=; Max-Age=0; Path=/";
  clearPendingReferral();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

/** The address bar the visitor arrived on, as the page sees it. */
function arriveAt(query: string) {
  search = query;
  window.history.replaceState(null, "", `/en/register${query ? `?${query}` : ""}`);
}

function validateResponds(body: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) =>
    String(url).startsWith("/api/referral/validate")
      ? { ok: true, json: async () => body }
      : { ok: true, json: async () => ({ success: true }) },
  );
}

// The next-intl mock renders the real English copy, so the queries below use
// the strings from messages/en.json → auth.
const CHOOSER_HEADING = "What would you like to do?";

/** Plain /register: pick "Find a job" on the chooser to reach the form. */
async function openForm() {
  render(<RegisterPage />);
  fireEvent.click(screen.getByText("Find a job"));
}

/** A referral link lands on the form directly — there is no chooser to click. */
async function openReferralForm() {
  render(<RegisterPage />);
  expect(screen.queryByText(CHOOSER_HEADING)).toBeNull();
  expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
}

describe("/register?ref= (job seeker)", () => {
  it("skips the Find a job / Hire talent chooser and offers no way back to it", async () => {
    search = "ref=MPL-1A2B3C4D5E6F7A8B";
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("shows the notice, writes no cookie on arrival and sends the code with the email form", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    expect(document.cookie).not.toContain("mpl_ref");
    expect(document.cookie).not.toContain("MPL-1A2B3C4D5E6F7A8B");

    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(/^Email address/), { target: { value: "sara@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "Str0ng!Passw0rd#2026" } });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/), { target: { value: "Str0ng!Passw0rd#2026" } });
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
    await openReferralForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "firebase",
        expect.objectContaining({ idToken: "id-token", referralCode: "MPL-1A2B3C4D5E6F7A8B" }),
      ),
    );
  });

  it("explains an employer link, sets nothing and keeps the way back to Hire talent", async () => {
    search = "ref=MPL-1A2B3C4D5E6F7A8B";
    validateResponds({ valid: true, audience: "employer" });
    await openReferralForm();
    await waitFor(() =>
      expect(
        screen.getByText("This link is for employers. You can still create a job-seeker account."),
      ).toBeInTheDocument(),
    );
    expect(document.cookie).not.toContain("mpl_ref=MPL");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText(CHOOSER_HEADING)).toBeInTheDocument();
  });

  it("takes ref out of the address bar and keeps the other params", async () => {
    arriveAt("callbackUrl=%2Fen%2Fjobs%2F1&ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    // After a tick, so Next's router has patched history first (Back button).
    await waitFor(() => expect(window.location.search).toBe("?callbackUrl=%2Fen%2Fjobs%2F1"));
  });

  it("waits a tick before cleaning the address bar", async () => {
    arriveAt("foo=1&ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    expect(window.location.search).toBe("?foo=1&ref=MPL-1A2B3C4D5E6F7A8B");
    await waitFor(() => expect(window.location.search).toBe("?foo=1"));
  });

  it("keeps a validated code in memory so links elsewhere on the site can carry it", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(getPendingReferral()).toBe("MPL-1A2B3C4D5E6F7A8B"));
  });

  it("does not remember an unknown or employer code", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "employer" });
    await openReferralForm();
    await waitFor(() =>
      expect(screen.getByText("This link is for employers. You can still create a job-seeker account.")).toBeInTheDocument(),
    );
    expect(getPendingReferral()).toBe("");
  });

  it("starts from a code held in memory when the address has none (arriving from a shared job page)", async () => {
    setPendingReferral("MPL-1A2B3C4D5E6F7A8B");
    arriveAt("");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm(); // no chooser: the code already answered "Find a job"
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
  });

  it("forgets the code once the e-mail sign-up has signed the person in", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(getPendingReferral()).toBe("MPL-1A2B3C4D5E6F7A8B"));

    fireEvent.change(screen.getByLabelText(/^Full Name/), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText(/^Email address/), { target: { value: "sara@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "Str0ng!Passw0rd#2026" } });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/), { target: { value: "Str0ng!Passw0rd#2026" } });
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(getPendingReferral()).toBe("");
  });

  it("keeps the code once the address bar no longer has it (the notice and the sign-up still use it)", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    const { rerender } = render(<RegisterPage />);
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    // Next re-reads the address bar after history.replaceState: ref is gone from searchParams.
    search = "";
    rerender(<RegisterPage />);
    expect(screen.getByTestId("referral-notice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "firebase",
        expect.objectContaining({ referralCode: "MPL-1A2B3C4D5E6F7A8B" }),
      ),
    );
  });

  it.each(["LinkedIn", "Apple"])("writes the code into mpl_signup_consent when %s is clicked, and not before", async (provider) => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "job_seeker" });
    await openReferralForm();
    await waitFor(() => expect(screen.getByTestId("referral-notice")).toBeInTheDocument());
    expect(document.cookie).not.toContain("mpl_signup_consent");

    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(provider) }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith(provider.toLowerCase(), expect.anything()));
    expect(document.cookie).toContain("mpl_signup_consent=terms~MPL-1A2B3C4D5E6F7A8B");
    expect(document.cookie).not.toContain("mpl_ref");
  });

  it("writes the consent cookie without a code when the link is not a valid referral", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: false });
    await openReferralForm();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/referral/validate")));
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: /LinkedIn/ }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("linkedin", expect.anything()));
    expect(document.cookie).toContain("mpl_signup_consent=terms");
    expect(document.cookie).not.toContain("MPL-");
    expect(screen.queryByTestId("referral-notice")).toBeNull();
  });

  it("does not carry an employer code into the job-seeker sign-up cookie", async () => {
    arriveAt("ref=MPL-1A2B3C4D5E6F7A8B");
    validateResponds({ valid: true, audience: "employer" });
    await openReferralForm();
    await waitFor(() =>
      expect(screen.getByText("This link is for employers. You can still create a job-seeker account.")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/I agree to the/));
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("apple", expect.anything()));
    expect(document.cookie).not.toContain("MPL-");
  });

  it("ignores a malformed ref without calling validate", async () => {
    search = "ref=<script>";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await openForm();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/referral/validate"));
    expect(screen.queryByTestId("referral-notice")).toBeNull();
  });
});

describe("/register (no referral)", () => {
  it("asks Find a job / Hire talent first, and Change returns to that choice", async () => {
    search = "";
    await openForm();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText(CHOOSER_HEADING)).toBeInTheDocument();
  });
});
