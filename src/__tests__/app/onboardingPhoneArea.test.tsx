/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import JobSeekerOnboardingPage from "@/app/[locale]/(onboarding)/onboarding/page";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "X Beat" } }, status: "authenticated", update: jest.fn() }),
}));

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
    <select id={id} value={value} onChange={(event) => onValueChange(event.target.value)}>
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

/**
 * Production report 2026-09-30: the phone code sat on UAE after the seeker
 * chose India as their country, and picking India in the code list itself
 * snapped back to UAE.
 */
describe("onboarding phone code and area country", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: null }) }) as unknown as typeof fetch;
  });

  const phoneCountry = () => document.getElementById("ob-mobileNumber-country") as HTMLSelectElement;
  const areaCountry = () => document.querySelector<HTMLSelectElement>('select[id^="seeker-area-country-"]')!;

  async function choose(select: HTMLSelectElement, code: string) {
    await act(async () => {
      fireEvent.change(select, { target: { value: code } });
    });
  }

  it("moves the default phone code to the country the seeker lives in", async () => {
    await act(async () => { render(<JobSeekerOnboardingPage />); });
    expect(phoneCountry().value).toBe("AE");

    await choose(areaCountry(), "IN");

    expect(phoneCountry().value).toBe("IN");
    expect(screen.getByRole("textbox", { name: /mobile number/i })).toHaveValue("");
  });

  it("leaves a typed number's code alone, e.g. a UAE number while living in India", async () => {
    await act(async () => { render(<JobSeekerOnboardingPage />); });
    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: /mobile number/i }), { target: { value: "501234567" } });
    });

    await choose(areaCountry(), "IN");

    expect(phoneCountry().value).toBe("AE");
    expect(screen.getByRole("textbox", { name: /mobile number/i })).toHaveValue("501234567");
  });

  it("keeps a phone code the seeker picked, e.g. an Indian number while living in the UAE", async () => {
    await act(async () => { render(<JobSeekerOnboardingPage />); });

    await choose(phoneCountry(), "IN");
    await choose(areaCountry(), "AE");

    expect(phoneCountry().value).toBe("IN");
    expect(areaCountry().value).toBe("AE");
  });
});
