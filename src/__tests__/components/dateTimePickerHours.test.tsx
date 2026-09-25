/**
 * @jest-environment jsdom
 *
 * The time picker listed 00–23 beside an AM/PM toggle, so "14" + "AM" was a
 * choice it offered (audit 2026-09-24, JRN-03). The hour column now shows the
 * twelve hours of the half the toggle selects; the value stays 24-hour.
 */
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DateTimePicker } from "@/components/ui/date-time-picker";

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t, useLocale: () => "en" }));

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

function openPicker(value: string) {
  const onChange = jest.fn();
  render(<DateTimePicker mode="time" value={value} onChange={onChange} label="Start" />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  return onChange;
}

const hourLabels = () =>
  screen.getAllByRole("button").map((b) => b.textContent ?? "").filter((x) => /^\d\d$/.test(x)).slice(0, 12);

it("shows 12, 01 … 11 — never 13–23 — beside AM/PM", () => {
  openPicker("14:30");
  expect(hourLabels()).toEqual(["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
  expect(screen.getByRole("button", { name: "pm" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "am" })).toHaveAttribute("aria-pressed", "false");
});

it("maps a PM hour back to 24-hour time", () => {
  const onChange = openPicker("09:00");
  fireEvent.click(screen.getByRole("button", { name: "pm" }));
  expect(onChange).toHaveBeenLastCalledWith("21:00");
  fireEvent.click(within(document.body).getAllByRole("button", { name: "02" })[0]);
  expect(onChange).toHaveBeenLastCalledWith("14:00");
});

it("12 AM is midnight and 12 PM is noon", () => {
  const onChange = openPicker("09:00");
  fireEvent.click(screen.getAllByRole("button", { name: "12" })[0]);
  expect(onChange).toHaveBeenLastCalledWith("00:00");
  fireEvent.click(screen.getByRole("button", { name: "pm" }));
  expect(onChange).toHaveBeenLastCalledWith("12:00");
});
