/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { CookiesDisabledNotice, useCookiesEnabled } from "@/components/shared/CookiesDisabledNotice";

const COPY = "Cookies are turned off in your browser. Signing in needs them: turn them on for this site, then reload this page.";

function setCookieEnabled(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "cookieEnabled", { value, configurable: true });
}

afterEach(() => {
  // Back to jsdom's own getter on Navigator.prototype.
  delete (window.navigator as unknown as { cookieEnabled?: boolean }).cookieEnabled;
});

/**
 * Sign-in and sign-up both need the session cookie. With cookies off the form
 * looks fine and then quietly fails, so the page says so before the visitor
 * types anything. navigator.cookieEnabled is a client-only fact: the server
 * render must stay silent or React reports a hydration mismatch.
 */
describe("CookiesDisabledNotice", () => {
  it("shows nothing when cookies are on", () => {
    setCookieEnabled(true);
    const { container } = render(<CookiesDisabledNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the visitor what is wrong and what to do when cookies are off", () => {
    setCookieEnabled(false);
    render(<CookiesDisabledNotice />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(COPY);
  });

  it("does not rely on colour alone: the notice carries an icon as well as words", () => {
    setCookieEnabled(false);
    render(<CookiesDisabledNotice />);
    const svg = screen.getByRole("alert").querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("takes extra classes from the caller", () => {
    setCookieEnabled(false);
    render(<CookiesDisabledNotice className="mt-2" />);
    expect(screen.getByRole("alert")).toHaveClass("mt-2");
  });

  it("treats an unknown value (undefined) as 'on': only an explicit false shows the notice", () => {
    setCookieEnabled(undefined);
    const { container } = render(<CookiesDisabledNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the server, even for a browser that has cookies off", () => {
    setCookieEnabled(false);
    expect(renderToString(<CookiesDisabledNotice />)).toBe("");
  });

  it("hydrates a silent server render without a mismatch, then shows the notice", async () => {
    setCookieEnabled(false);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    host.innerHTML = renderToString(<CookiesDisabledNotice />);
    document.body.appendChild(host);

    await act(async () => {
      hydrateRoot(host, <CookiesDisabledNotice />);
    });

    expect(errors).not.toHaveBeenCalled();
    expect(host).toHaveTextContent(COPY);
    errors.mockRestore();
    host.remove();
  });

  it("useCookiesEnabled reports the browser's setting", () => {
    function Probe() {
      return <span>{String(useCookiesEnabled())}</span>;
    }
    setCookieEnabled(false);
    const off = render(<Probe />);
    expect(off.container).toHaveTextContent("false");
    off.unmount();
    setCookieEnabled(true);
    expect(render(<Probe />).container).toHaveTextContent("true");
  });
});
