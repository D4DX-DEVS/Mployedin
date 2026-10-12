/**
 * @jest-environment jsdom
 *
 * A job with no `createdAt` reached the public job search (live, 2026-10-12:
 * /en/jobs?location=Dubai%2C%20UAE) and `Intl.RelativeTimeFormat` threw on the
 * NaN day count, so the whole results page fell into the error boundary. A date
 * that can't be read now renders nothing instead.
 */
import React from "react";
import { render } from "@testing-library/react";
import RelativeDate from "@/components/shared/RelativeDate";

jest.mock("next-intl", () => ({ useLocale: () => "en" }));

describe("RelativeDate", () => {
  it("still renders a real date", () => {
    const { container } = render(<RelativeDate date={new Date()} />);
    expect(container.textContent).toBe("today");
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["not a date", "not-a-date"],
  ])("renders nothing for a %s date instead of throwing", (_label, date) => {
    const { container } = render(<RelativeDate date={date as unknown as string} prefix="Posted" />);
    expect(container.textContent).toBe("");
  });
});
