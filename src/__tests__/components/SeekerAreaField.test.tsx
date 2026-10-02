/**
 * @jest-environment jsdom
 *
 * The seeker area field: a city from the list, or the region when the city
 * isn't listed (owner, 2026-10-02).
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SeekerAreaField, type SeekerAreaValue } from "@/components/features/job-seeker/SeekerAreaField";

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ id, value, onValueChange, options }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select id={id} value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="" />
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));

let latest: SeekerAreaValue;
function Harness({ initial }: { initial: SeekerAreaValue }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return <SeekerAreaField value={value} onChange={setValue} required />;
}

const regionSelect = () => document.querySelector<HTMLSelectElement>('select[id^="seeker-area-region-"]');
const countrySelect = () => document.querySelector<HTMLSelectElement>('select[id^="seeker-area-country-"]')!;

beforeEach(() => {
  global.fetch = jest.fn((url: string) => {
    if (url.includes("country=IN")) {
      return Promise.resolve({ ok: true, json: async () => ({ states: [{ _id: "kerala", name: "Kerala" }] }) } as Response);
    }
    return new Promise<Response>(() => {}); // the UAE list is still loading
  }) as unknown as typeof fetch;
});

it("swaps the city picker for the region list, and back, dropping the pick it replaces", async () => {
  render(<Harness initial={{ countryCode: "IN", city: { id: "c1", name: "Tirur" }, region: null }} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "My city isn't listed" })); });
  expect(latest).toEqual({ countryCode: "IN", city: null, region: null });
  await waitFor(() => expect(regionSelect()?.querySelector('option[value="kerala"]')).not.toBeNull());

  await act(async () => { fireEvent.change(regionSelect()!, { target: { value: "kerala" } }); });
  expect(latest.region).toEqual({ id: "kerala", name: "Kerala" });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pick a city instead" })); });
  expect(latest).toEqual({ countryCode: "IN", city: null, region: null });
  expect(regionSelect()).toBeNull();
});

it("never offers the last country's regions while another country's load", async () => {
  render(<Harness initial={{ countryCode: "IN", city: null, region: null }} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "My city isn't listed" })); });
  await waitFor(() => expect(regionSelect()?.querySelector('option[value="kerala"]')).not.toBeNull());

  await act(async () => { fireEvent.change(countrySelect(), { target: { value: "AE" } }); });
  expect(regionSelect()?.querySelector('option[value="kerala"]')).toBeNull();
});
