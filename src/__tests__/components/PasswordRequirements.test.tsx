/**
 * @jest-environment jsdom
 *
 * Client sheet: "job seeker — password setting conditions". The rules used to
 * appear only as an error after a failed submit; the checklist shows them
 * while the person types, ticked off from the same rules the server enforces.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { PasswordRequirements } from "@/components/shared/PasswordRequirements";

function renderList(password: string) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PasswordRequirements password={password} />
    </NextIntlClientProvider>,
  );
  return screen.getAllByRole("listitem").map((li) => ({
    text: li.textContent ?? "",
    met: within(li).queryByText("done") !== null,
  }));
}

describe("PasswordRequirements", () => {
  it("lists every rule, none met, before anything is typed", () => {
    const rules = renderList("");
    expect(rules.map((r) => r.text.replace(/still needed$/, ""))).toEqual([
      "At least 12 characters",
      "An uppercase letter (A–Z)",
      "A lowercase letter (a–z)",
      "A number (0–9)",
      "A symbol such as ! @ #",
    ]);
    expect(rules.every((r) => !r.met)).toBe(true);
  });

  it("ticks off each rule as it is met", () => {
    const rules = renderList("abcD1");
    expect(rules.map((r) => r.met)).toEqual([false, true, true, true, false]);
  });

  it("all met for a password the server accepts", () => {
    expect(renderList("Str0ng!Passw0rd").every((r) => r.met)).toBe(true);
    expect(screen.queryByText(/too common/i)).toBeNull();
  });

  it("warns about a common password even when every rule is met", () => {
    renderList("Password123!");
    expect(screen.getByText(/too common/i)).toBeInTheDocument();
  });
});
