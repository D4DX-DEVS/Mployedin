/**
 * @jest-environment jsdom
 *
 * Escape closes the Copilot panel, but not when a dialog opened from inside it
 * (the shortlist's CV export) has already taken the key: a Radix dialog marks
 * the event handled (defaultPrevented) before the panel's own listener runs.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Copilot } from "@/components/shared/Copilot";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin",
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

const panelIsOpen = () => screen.queryByRole("textbox") !== null;

it("closes on Escape", () => {
  render(<Copilot />);
  fireEvent.click(screen.getByRole("button", { name: "Open Copilot" }));
  expect(panelIsOpen()).toBe(true);

  fireEvent.keyDown(document, { key: "Escape" });
  expect(panelIsOpen()).toBe(false);
});

it("stays open when Escape was already handled by a dialog on top of it", () => {
  render(<Copilot />);
  fireEvent.click(screen.getByRole("button", { name: "Open Copilot" }));
  expect(panelIsOpen()).toBe(true);

  // What a Radix dialog does in its capture-phase listener before the panel's bubbling one.
  const handled = (event: KeyboardEvent) => event.preventDefault();
  document.addEventListener("keydown", handled, true);
  try {
    fireEvent.keyDown(document, { key: "Escape", cancelable: true });
  } finally {
    document.removeEventListener("keydown", handled, true);
  }
  expect(panelIsOpen()).toBe(true);
});
