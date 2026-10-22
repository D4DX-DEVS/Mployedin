/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { CaptchaNotice } from "@/components/shared/CaptchaNotice";

const state = { enabled: true };
jest.mock("@/lib/browser/captcha", () => {
  const actual = jest.requireActual("@/lib/browser/captcha");
  return { ...actual, isCaptchaEnabled: () => state.enabled };
});

/**
 * The visible half of the captcha disclosure: "Protected by reCAPTCHA. Google's
 * Privacy Policy and Terms apply." with both policies linked. It follows the
 * provider (the links and wording come from the adapter) and it renders only
 * when a captcha will really run, so a build with no site key says nothing.
 */
describe("CaptchaNotice", () => {
  beforeEach(() => {
    state.enabled = true;
  });

  it("renders nothing when captcha is not enabled", () => {
    state.enabled = false;
    const { container } = render(<CaptchaNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says who protects the form and whose policies apply, as one sentence", () => {
    const { container } = render(<CaptchaNotice />);
    expect(container.textContent).toBe("Protected by reCAPTCHA. Google's Privacy Policy (opens in a new tab) and Terms (opens in a new tab) apply.");
  });

  it("links Google's Privacy Policy and Terms, each in a new tab without leaking the opener", () => {
    render(<CaptchaNotice />);

    const privacy = screen.getByRole("link", { name: "Privacy Policy (opens in a new tab)" });
    const terms = screen.getByRole("link", { name: "Terms (opens in a new tab)" });
    expect(privacy).toHaveAttribute("href", "https://policies.google.com/privacy");
    expect(terms).toHaveAttribute("href", "https://policies.google.com/terms");
    for (const link of [privacy, terms]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")?.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    }
  });

  it("keeps the links inside the sentence, in the order the message gives them", () => {
    const { container } = render(<CaptchaNotice />);
    const links = [...container.querySelectorAll("a")].map((a) => a.textContent);
    expect(links).toEqual(["Privacy Policy (opens in a new tab)", "Terms (opens in a new tab)"]);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("p")?.contains(container.querySelector("a"))).toBe(true);
  });

  it("is small muted text and takes extra classes from the caller", () => {
    const { container } = render(<CaptchaNotice className="-mt-2" />);
    const p = container.querySelector("p");
    expect(p).toHaveClass("text-xs", "text-muted-foreground", "-mt-2");
  });

  it("does not load anything by being shown", () => {
    render(<CaptchaNotice />);
    expect(document.querySelector("script[src*='recaptcha']")).toBeNull();
    expect(window.grecaptcha).toBeUndefined();
  });
});
