/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { PhoneInput } from "@/components/shared/PhoneInput";
import type { PhoneCountry } from "@/lib/phone/countries";

jest.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    id,
    value,
    onValueChange,
    options,
  }: {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <select id={id} aria-label="Country" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

/** A parent that owns the value, the way every form using the field does. */
function Harness({ initial, onCountryChange }: { initial: string; onCountryChange?: (country: PhoneCountry) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneInput value={value} onChange={setValue} onCountryChange={onCountryChange} />
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setValue("+91 9876543210")}>load saved</button>
    </>
  );
}

const country = () => screen.getByRole("combobox", { name: "Country" }) as HTMLSelectElement;

describe("PhoneInput country code", () => {
  beforeEach(() => {
    // An empty /api/countries answer keeps the built-in list.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => null }) as unknown as typeof fetch;
  });

  async function pick(code: string) {
    await act(async () => {
      fireEvent.change(country(), { target: { value: code } });
    });
  }

  it("keeps a country picked before any number is typed", async () => {
    render(<Harness initial="" />);
    await pick("IN");
    expect(country().value).toBe("IN");
  });

  it("keeps the pick when the parent still holds the default code with no number", async () => {
    render(<Harness initial="+971 " />);
    await pick("IN");
    expect(country().value).toBe("IN");
    // The old code must not leak into the number box as digits.
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("switches country when a number with another code is pasted", async () => {
    const onCountryChange = jest.fn();
    render(<Harness initial="" onCountryChange={onCountryChange} />);
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "+91 98765 43210" } });
    });
    expect(country().value).toBe("IN");
    expect(screen.getByRole("textbox")).toHaveValue("9876543210");
    expect(screen.getByTestId("value")).toHaveTextContent("+91 9876543210");
    expect(onCountryChange).toHaveBeenCalledWith(expect.objectContaining({ code: "IN" }));
  });

  it("keeps a country that shares its dial code with another", async () => {
    render(<Harness initial="+1 4165550123" />);
    await pick("CA");
    expect(country().value).toBe("CA");
    expect(screen.getByTestId("value")).toHaveTextContent("+1 4165550123");
  });

  it("follows a saved number that arrives from the parent", async () => {
    render(<Harness initial="+971 " />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "load saved" }));
    });
    expect(country().value).toBe("IN");
    expect(screen.getByRole("textbox")).toHaveValue("9876543210");
  });

  it("tells the parent which country was picked", async () => {
    const onCountryChange = jest.fn();
    render(<Harness initial="" onCountryChange={onCountryChange} />);
    await pick("IN");
    expect(onCountryChange).toHaveBeenCalledWith(expect.objectContaining({ code: "IN", dialCode: "+91" }));
  });
});
