/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="session">{children}</div>,
}));
jest.mock("@/components/shared/IdleTimeoutGuard", () => ({ IdleTimeoutGuard: () => null }));

type G = { BroadcastChannel?: unknown };
const g = globalThis as unknown as G;
const original = g.BroadcastChannel;

afterEach(() => {
  g.BroadcastChannel = original;
});

function loadWrapper() {
  let mod!: typeof import("@/components/shared/SessionWrapper");
  jest.isolateModules(() => {
    mod = require("@/components/shared/SessionWrapper");
  });
  return mod.SessionWrapper;
}

/**
 * next-auth's client does `new BroadcastChannel("next-auth")` without a
 * try/catch. Firefox with cookies blocked throws SecurityError from it, which
 * took the whole site down. A visitor who blocks cookies is making a privacy
 * choice and must still get a working site, so the wrapper probes the
 * constructor once and, if it throws, removes it: next-auth then uses its own
 * no-op stand-in.
 */
describe("SessionWrapper and a throwing BroadcastChannel", () => {
  it("still renders its children, and removes the broken BroadcastChannel", () => {
    g.BroadcastChannel = class {
      constructor() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      }
    };
    const SessionWrapper = loadWrapper();

    render(<SessionWrapper>hello</SessionWrapper>);

    expect(screen.getByTestId("session")).toHaveTextContent("hello");
    expect(g.BroadcastChannel).toBeUndefined();
  });

  it("leaves a working BroadcastChannel in place, and closes the probe channel", () => {
    const close = jest.fn();
    const ctor = jest.fn(function (this: { close: () => void }) {
      this.close = close;
    });
    g.BroadcastChannel = ctor;
    const SessionWrapper = loadWrapper();

    render(<SessionWrapper>hello</SessionWrapper>);

    expect(g.BroadcastChannel).toBe(ctor);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does nothing where BroadcastChannel does not exist", () => {
    g.BroadcastChannel = undefined;
    const SessionWrapper = loadWrapper();

    render(<SessionWrapper>hello</SessionWrapper>);

    expect(screen.getByTestId("session")).toHaveTextContent("hello");
  });
});
