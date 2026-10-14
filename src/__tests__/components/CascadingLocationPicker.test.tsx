/**
 * @jest-environment jsdom
 */
/**
 * The picker defaults to the public catalogue. Role-scoped callers (a
 * super-agent assigning a region inside their own territory) hand it a
 * different endpoint and the picker must (a) fetch every cascade level from
 * it and (b) hide "select the entire state" when the server says the state is
 * only partly theirs — otherwise the POST rejects after the form is filled.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";

const calls: string[] = [];

const INDIA = { _id: "co_in", name: "India", code: "IN" };
const UAE = { _id: "co_ae", name: "United Arab Emirates", code: "AE" };
const KERALA = { _id: "st_kerala", name: "Kerala", countryId: "co_in" };
const KARNATAKA = { _id: "st_karnataka", name: "Karnataka", countryId: "co_in" };
let countryList = [INDIA, UAE];
let stateList = [KERALA, KARNATAKA];

function respond(url: string) {
  const u = new URL(url, "http://localhost");
  const level = u.searchParams.get("level");
  if (level === "countries") return { countries: countryList };
  if (level === "states") return { states: stateList };
  if (level === "cities") {
    return {
      cities: [{ _id: "c_tirur", name: "Tirur", stateId: "st_kerala" }],
      stateFullyAssigned: u.pathname.includes("territory") ? false : undefined,
    };
  }
  return { cities: [], states: [] };
}

beforeEach(() => {
  calls.length = 0;
  countryList = [INDIA, UAE];
  stateList = [KERALA, KARNATAKA];
  global.fetch = jest.fn((url: string) => {
    calls.push(url);
    return Promise.resolve({ ok: true, json: async () => respond(url) });
  }) as unknown as typeof fetch;
});

async function drillToCities() {
  fireEvent.click(screen.getByRole("button", { name: /select locations/i }));
  await waitFor(() => expect(calls.some((c) => c.includes("level=countries"))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: /select country/i }));
  fireEvent.click(await screen.findByRole("button", { name: /india/i }));
  await waitFor(() => expect(calls.some((c) => c.includes("level=states"))).toBe(true));
  fireEvent.click(await screen.findByRole("button", { name: /select state/i }));
  fireEvent.click(await screen.findByRole("button", { name: /kerala/i }));
  await waitFor(() => expect(calls.some((c) => c.includes("level=cities"))).toBe(true));
  await screen.findByText("Tirur");
}

describe("CascadingLocationPicker", () => {
  it("fetches every cascade level from the supplied endpoint", async () => {
    render(
      <CascadingLocationPicker
        selectedCityIds={[]}
        selectedStateIds={[]}
        onChange={() => {}}
        locationsEndpoint="/api/super-agent/territory/locations"
      />
    );
    await drillToCities();
    const cascade = calls.filter((c) => /level=(countries|states|cities)/.test(c));
    expect(cascade.length).toBe(3);
    for (const c of cascade) expect(c.startsWith("/api/super-agent/territory/locations?")).toBe(true);
  });

  it("defaults to the public catalogue and offers the whole state", async () => {
    render(<CascadingLocationPicker selectedCityIds={[]} selectedStateIds={[]} onChange={() => {}} />);
    await drillToCities();
    expect(calls.every((c) => c.startsWith("/api/filters/locations?"))).toBe(true);
    expect(screen.getByRole("button", { name: /all state/i })).toBeInTheDocument();
  });

  it("hides the whole-state option when the server marks the state partially assigned", async () => {
    render(
      <CascadingLocationPicker
        selectedCityIds={[]}
        selectedStateIds={[]}
        onChange={() => {}}
        locationsEndpoint="/api/super-agent/territory/locations"
      />
    );
    await drillToCities();
    expect(screen.queryByRole("button", { name: /all state/i })).not.toBeInTheDocument();
  });

  it("shows the empty-territory message instead of a bare empty dropdown", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ countries: [] }) })
    ) as unknown as typeof fetch;
    render(
      <CascadingLocationPicker
        selectedCityIds={[]}
        selectedStateIds={[]}
        onChange={() => {}}
        locationsEndpoint="/api/super-agent/territory/locations"
        emptyMessage="No territory assigned"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /select locations/i }));
    expect(await screen.findByText("No territory assigned")).toBeInTheDocument();
  });

  /* A super agent holding one state (Capital Governorate, Bahrain) leaves
     exactly one country and one state to pick: fill both in, so the admin
     lands on the cities instead of re-picking the only options. */
  it("fills in the only country and the only state and opens its cities", async () => {
    countryList = [INDIA];
    stateList = [KERALA];
    const onChange = jest.fn();
    render(
      <CascadingLocationPicker
        selectedCityIds={[]}
        selectedStateIds={[]}
        onChange={onChange}
        locationsEndpoint="/api/super-agent/territory/locations"
        alwaysOpen
      />
    );
    expect(await screen.findByText("Tirur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /india/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kerala/i })).toBeInTheDocument();
    // Navigating is not choosing: the agent's area stays empty until picked.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fills in the only country but leaves the state open when there are several", async () => {
    countryList = [INDIA];
    render(<CascadingLocationPicker selectedCityIds={[]} selectedStateIds={[]} onChange={() => {}} alwaysOpen />);
    await waitFor(() => expect(calls.some((c) => c.includes("level=states&countryId=co_in"))).toBe(true));
    expect(await screen.findByRole("button", { name: /select state/i })).toBeInTheDocument();
    expect(calls.some((c) => c.includes("level=cities"))).toBe(false);
  });

  it("picks nothing when there are several countries", async () => {
    render(<CascadingLocationPicker selectedCityIds={[]} selectedStateIds={[]} onChange={() => {}} alwaysOpen />);
    await waitFor(() => expect(calls.some((c) => c.includes("level=countries"))).toBe(true));
    expect(await screen.findByRole("button", { name: /select country/i })).toBeInTheDocument();
    expect(calls.some((c) => c.includes("level=states"))).toBe(false);
  });
});
