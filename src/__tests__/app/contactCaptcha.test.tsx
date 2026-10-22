/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import ContactPage from "@/app/[locale]/(public)/contact/page";

jest.mock("next/navigation", () => ({ usePathname: () => "/en/contact" }));

const captcha = { enabled: true, token: "tok-contact" as string | null };
jest.mock("@/lib/browser/captcha", () => {
  const actual = jest.requireActual("@/lib/browser/captcha");
  return {
    ...actual,
    isCaptchaEnabled: () => captcha.enabled,
    getCaptchaToken: jest.fn(async () => captcha.token),
  };
});
import { getCaptchaToken } from "@/lib/browser/captcha";

const BLOCKED = "We couldn't check you're not a bot. Check your connection or turn off blockers for this site, then try again.";
const UNAVAILABLE = "The bot check is temporarily unavailable. Please try again in a moment.";

/**
 * The contact form never sent a captcha token, so wherever RECAPTCHA_SECRET_KEY
 * was set the server answered 403 and no message could be sent. It now asks the
 * captcha provider for a token when (and only when) the visitor presses Send,
 * says so in a notice under the button, and refuses to post without a token.
 */
describe("contact form captcha", () => {
  const fetchMock = jest.fn();
  let contactResponse: { ok: boolean; status: number; body: Record<string, unknown> };

  beforeEach(() => {
    captcha.enabled = true;
    captcha.token = "tok-contact";
    (getCaptchaToken as jest.Mock).mockClear();
    contactResponse = { ok: true, status: 201, body: { success: true } };
    fetchMock.mockReset();
    // PhoneInput loads /api/countries on mount; an empty answer keeps its built-in list.
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/contact"
        ? { ok: contactResponse.ok, status: contactResponse.status, json: async () => contactResponse.body }
        : { ok: false, json: async () => null },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function fillValidForm() {
    fireEvent.change(screen.getByRole("textbox", { name: "Full Name" }), { target: { value: "Sara Ali", name: "name" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "sara@example.com", name: "email" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Message/ }), { target: { value: "Question about plans", name: "message" } });
  }

  async function submit() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    });
  }

  const contactCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/contact");

  it("shows the reCAPTCHA notice directly under the Send button when captcha is on", () => {
    render(<ContactPage />);

    const button = screen.getByRole("button", { name: /send message/i });
    const notice = screen.getByText(/Protected by reCAPTCHA/);
    expect(notice).toHaveTextContent("Protected by reCAPTCHA. Google's Privacy Policy (opens in a new tab) and Terms (opens in a new tab) apply.");
    expect(button.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.closest("form")?.contains(notice)).toBe(true);
    expect(screen.getByRole("link", { name: "Privacy Policy (opens in a new tab)" })).toHaveAttribute("href", "https://policies.google.com/privacy");
    expect(screen.getByRole("link", { name: "Terms (opens in a new tab)" })).toHaveAttribute("href", "https://policies.google.com/terms");
  });

  it("shows no notice when captcha is off", () => {
    captcha.enabled = false;
    render(<ContactPage />);
    expect(screen.queryByText(/Protected by reCAPTCHA/)).not.toBeInTheDocument();
  });

  it("asks for no token on page view or while typing, only when Send is pressed", async () => {
    render(<ContactPage />);
    fillValidForm();
    expect(getCaptchaToken).not.toHaveBeenCalled();

    await submit();

    expect(getCaptchaToken).toHaveBeenCalledTimes(1);
    expect(getCaptchaToken).toHaveBeenCalledWith("contact");
  });

  it("does not ask for a token when the form is incomplete (no point loading the script)", async () => {
    render(<ContactPage />);
    await submit();

    expect(getCaptchaToken).not.toHaveBeenCalled();
    expect(contactCalls()).toHaveLength(0);
  });

  it("posts the token with the message", async () => {
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(contactCalls()).toHaveLength(1);
    const [, init] = contactCalls()[0];
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Sara Ali",
      email: "sara@example.com",
      message: "Question about plans",
      captchaToken: "tok-contact",
    });
    expect(await screen.findByText("Message Sent!")).toBeInTheDocument();
  });

  it("with captcha off, posts no token field at all and still sends", async () => {
    captcha.enabled = false;
    captcha.token = null;
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(contactCalls()).toHaveLength(1);
    expect(JSON.parse(contactCalls()[0][1].body)).not.toHaveProperty("captchaToken");
    expect(await screen.findByText("Message Sent!")).toBeInTheDocument();
  });

  it("with captcha on but no token (blocked or offline), explains in 'couldn't' words and posts nothing", async () => {
    captcha.token = null;
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(BLOCKED);
    expect(contactCalls()).toHaveLength(0);
    // The visitor keeps what they typed and can press Send again.
    expect(screen.getByRole("textbox", { name: /^Message/ })).toHaveValue("Question about plans");
    expect(screen.getByRole("button", { name: /send message/i })).toBeEnabled();
  });

  it("says the same thing in plain words when the server turns the token away", async () => {
    contactResponse = { ok: false, status: 403, body: { error: "CAPTCHA verification failed", code: "CAPTCHA_FAILED" } };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(BLOCKED);
    expect(screen.queryByText("CAPTCHA verification failed")).not.toBeInTheDocument();
  });

  it("says the check is unavailable when the server could not reach the provider", async () => {
    contactResponse = {
      ok: false,
      status: 503,
      body: { error: "CAPTCHA verification is temporarily unavailable", code: "CAPTCHA_UNAVAILABLE" },
    };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
  });

  // Final review M10: on /ar these refusals showed the server's English sentence.
  it("says a rate-limit refusal in its own translated words, not the server's English", async () => {
    contactResponse = { ok: false, status: 429, body: { error: "Too many submissions. Please try again later." } };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't send your message because several were sent in a short time. Please try again in 10 minutes.",
    );
    expect(screen.queryByText(/Too many submissions/)).not.toBeInTheDocument();
  });

  it("says a validation refusal in its own translated words", async () => {
    contactResponse = { ok: false, status: 400, body: { error: "Validation failed", details: [] } };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't send your message. Check your details and try again.",
    );
    expect(screen.queryByText(/Validation failed/)).not.toBeInTheDocument();
  });

  it("never shows a server sentence for a refusal it does not know", async () => {
    contactResponse = { ok: false, status: 418, body: { error: "Some English sentence" } };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't send your message. Please try again.");
    expect(screen.queryByText(/Some English sentence/)).not.toBeInTheDocument();
  });

  it("uses its own translated message, not English literals, when the server fails without a code", async () => {
    contactResponse = { ok: false, status: 500, body: { error: "Failed to submit your message. Please try again." } };
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't send your message. Please try again.");
    expect(screen.queryByText(/Failed to/)).not.toBeInTheDocument();
  });

  it("says the same when the request itself cannot be made", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/contact") throw new TypeError("Failed to fetch");
      return { ok: false, json: async () => null };
    });
    render(<ContactPage />);
    fillValidForm();
    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't send your message. Please try again.");
    expect(screen.queryByText(/Failed to fetch|Something went wrong/)).not.toBeInTheDocument();
  });
});
