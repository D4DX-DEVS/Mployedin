/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";
import { getNonce, setNonce } from "get-nonce";
import { styleSingleton } from "react-style-singleton";

import { CspNonceProvider } from "@/components/shared/CspNonceProvider";

// Prod CSP ships `style-src-elem 'self' 'nonce-…'` with no 'unsafe-inline', so
// every runtime-injected <style> must carry the request nonce or the browser
// blocks it. Radix's scroll lock injects one through react-style-singleton,
// which reads the nonce from the `get-nonce` module — the layout only ever set
// `window.__webpack_nonce__`, which webpack rewrites away at build time, so the
// nonce never arrived and opening the user menu logged a CSP violation.
describe("CspNonceProvider", () => {
  beforeEach(() => {
    setNonce(undefined as unknown as string);
    document.head.querySelectorAll("style").forEach((el) => el.remove());
  });

  it("publishes the request nonce to the runtime style injector", () => {
    render(<CspNonceProvider nonce="nonce-abc123" />);
    expect(getNonce()).toBe("nonce-abc123");
  });

  it("renders no markup of its own", () => {
    const { container } = render(<CspNonceProvider nonce="nonce-abc123" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("leaves the nonce unset when the request carried none", () => {
    render(<CspNonceProvider />);
    expect(getNonce()).toBeUndefined();
  });

  it("makes react-style-singleton stamp its injected <style> with the nonce", () => {
    const Style = styleSingleton();
    render(
      <>
        <CspNonceProvider nonce="nonce-abc123" />
        <Style styles="body{--csp-probe:1}" />
      </>
    );
    const injected = Array.from(document.head.querySelectorAll("style")).find((el) =>
      el.textContent?.includes("--csp-probe")
    );
    expect(injected).toBeDefined();
    expect(injected?.getAttribute("nonce")).toBe("nonce-abc123");
  });
});
