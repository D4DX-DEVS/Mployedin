/**
 * @jest-environment jsdom
 *
 * Owner, 2026-10-02: the seeker's area is required at onboarding — a city from
 * the list, or just the region when their city isn't listed — and it is filled
 * in from what they already gave us, which they can change.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  useSession: () => ({ data: { user: { name: "Asha" } }, status: "authenticated", update: jest.fn() }),
}));
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

const json = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);
let storedProfile: Record<string, unknown> | null;
let fetchMock: jest.Mock;

beforeEach(() => {
  window.scrollTo = jest.fn();
  storedProfile = null;
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url === "/api/job-seekers/profile" && init?.method === "PATCH") return json({ success: true });
    if (url === "/api/job-seekers/profile") return json({ profile: storedProfile });
    if (url.startsWith("/api/filters/locations?level=states")) return json({ states: [{ _id: "state-kerala", name: "Kerala" }] });
    if (url.startsWith("/api/filters/locations")) {
      return json({ results: url.includes("search=Tirur") ? [{ _id: "city-tirur", name: "Tirur" }] : [] });
    }
    return json({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const saveAndContinue = () => screen.getByRole("button", { name: /save and continue/i });
const areaCountry = () => document.querySelector<HTMLSelectElement>('select[id^="seeker-area-country-"]')!;
const regionSelect = () => document.querySelector<HTMLSelectElement>('select[id^="seeker-area-region-"]');
const saves = () => fetchMock.mock.calls
  .filter(([url, init]) => url === "/api/job-seekers/profile" && init?.method === "PATCH")
  .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);

async function answerTheRest() {
  await act(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: /mobile number/i }), { target: { value: "9746060086" } });
  });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /i'm a fresher/i })); });
}

it("won't continue until the seeker says where they live", async () => {
  await act(async () => { render(<JobSeekerOnboardingPage />); });
  await answerTheRest();
  expect(saveAndContinue()).toBeDisabled();
  expect(screen.getByText("Pick your city, or your region if your city isn't listed.")).toBeInTheDocument();
});

it("takes just the region when the seeker's city isn't listed", async () => {
  await act(async () => { render(<JobSeekerOnboardingPage />); });
  await answerTheRest();
  await act(async () => { fireEvent.change(areaCountry(), { target: { value: "IN" } }); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "My city isn't listed" })); });
  await waitFor(() => expect(regionSelect()?.querySelector('option[value="state-kerala"]')).not.toBeNull());
  await act(async () => { fireEvent.change(regionSelect()!, { target: { value: "state-kerala" } }); });

  expect(saveAndContinue()).toBeEnabled();
  await act(async () => { fireEvent.click(saveAndContinue()); });
  expect(saves()[0]).toMatchObject({ stateId: "state-kerala" });
  expect(saves()[0]).not.toHaveProperty("cityId");
});

it("fills the area in from a location already stored, and the seeker can change it", async () => {
  storedProfile = { phone: "+919746060086", currentLocation: "Tirur, Kerala, India" };
  await act(async () => { render(<JobSeekerOnboardingPage />); });

  await waitFor(() => expect(screen.getByText("We filled this in from your details. Change it if it isn't right.")).toBeInTheDocument());
  expect(areaCountry().value).toBe("IN");
  expect(screen.getByRole("option", { name: "Tirur" })).toHaveProperty("selected", true);

  // Their own change wins, and the note goes.
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "My city isn't listed" })); });
  expect(screen.queryByText("We filled this in from your details. Change it if it isn't right.")).toBeNull();
  expect(screen.getByText("Pick your city, or your region if your city isn't listed.")).toBeInTheDocument();
});

it("keeps an area already saved instead of filling one in", async () => {
  storedProfile = {
    phone: "+919746060086",
    currentLocation: "Tirur, Kerala, India",
    area: { cityId: null, cityName: null, stateId: "state-kerala", stateName: "Kerala", countryCode: "IN" },
  };
  await act(async () => { render(<JobSeekerOnboardingPage />); });
  await waitFor(() => expect(regionSelect()?.value).toBe("state-kerala"));
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search=Tirur"))).toBe(false);
});
