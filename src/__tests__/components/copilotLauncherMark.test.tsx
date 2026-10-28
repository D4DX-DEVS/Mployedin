/**
 * @jest-environment jsdom
 *
 * The Copilot launcher shows the brand mark. When that image fails to load
 * (a busy dev server dropped /favicon.ico and every dashboard showed a
 * broken-image glyph in the floating button), the assistant icon takes its
 * place instead.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Copilot } from "@/components/shared/Copilot";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/employer",
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: jest.fn() }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it("shows the brand mark on the launcher", () => {
  render(<Copilot />);
  const launcher = screen.getByRole("button", { name: "Open Copilot" });
  expect(launcher.querySelector("img")).toHaveAttribute("src", "/favicon.ico");
});

it("retries a dropped image once, so a one-off failure still ends with the mark", () => {
  render(<Copilot />);
  const launcher = screen.getByRole("button", { name: "Open Copilot" });
  fireEvent.error(launcher.querySelector("img")!);
  expect(launcher.querySelector("img")).toHaveAttribute("src", "/favicon.ico?retry=1");
  expect(launcher.querySelector("svg")).toBeNull();
});

it("swaps in the assistant icon when the retry fails too, never a broken image", () => {
  render(<Copilot />);
  const launcher = screen.getByRole("button", { name: "Open Copilot" });
  fireEvent.error(launcher.querySelector("img")!);
  fireEvent.error(launcher.querySelector("img")!);
  expect(launcher.querySelector("img")).toBeNull();
  expect(launcher.querySelector("svg")).not.toBeNull();
});
