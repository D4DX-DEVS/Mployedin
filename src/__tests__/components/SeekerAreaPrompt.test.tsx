/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { areaFromProfileLocation, SeekerAreaPrompt } from "@/components/features/job-seeker/SeekerAreaPrompt";

function mockCatalogue(cities: Record<string, Array<{ _id: string; name: string }>>, states: Array<{ _id: string; name: string }> = []) {
  global.fetch = jest.fn(async (url: string) => {
    const params = new URL(url, "http://x").searchParams;
    if (params.get("level") === "states") return { ok: true, json: async () => ({ results: states }) } as Response;
    const search = (params.get("search") ?? "").toLowerCase();
    return { ok: true, json: async () => ({ results: cities[search] ?? [] }) } as Response;
  }) as unknown as typeof fetch;
}

describe("areaFromProfileLocation", () => {
  it("finds the town in a line without commas (\"Malappuram Kerala\")", async () => {
    mockCatalogue({ malappuram: [{ _id: "c1", name: "Malappuram" }] });
    await expect(areaFromProfileLocation("Malappuram Kerala", "+91 9876543210")).resolves.toEqual({
      countryCode: "IN",
      city: { id: "c1", name: "Malappuram" },
      region: null,
    });
  });

  it("finds the town in a comma line", async () => {
    mockCatalogue({ tirur: [{ _id: "c2", name: "Tirur" }] });
    await expect(areaFromProfileLocation("Tirur, Kerala, India")).resolves.toMatchObject({
      countryCode: "IN",
      city: { id: "c2", name: "Tirur" },
    });
  });

  it("takes the country from the profile when the location line names none", async () => {
    mockCatalogue({ malappuram: [{ _id: "c1", name: "Malappuram" }] });
    await expect(areaFromProfileLocation("Malappuram, Kerala", undefined, "India")).resolves.toMatchObject({
      countryCode: "IN",
      city: { id: "c1", name: "Malappuram" },
    });
  });

  it("keeps just the country when no listed town matches", async () => {
    mockCatalogue({});
    await expect(areaFromProfileLocation("Somewhere, India")).resolves.toEqual({ countryCode: "IN", city: null, region: null });
  });

  it("is null without any location or phone", async () => {
    mockCatalogue({});
    await expect(areaFromProfileLocation(undefined, undefined)).resolves.toBeNull();
  });
});

describe("SeekerAreaPrompt", () => {
  beforeEach(() => window.sessionStorage.clear());

  function mockProfile(profile: Record<string, unknown>) {
    global.fetch = jest.fn(async (url: string) => {
      if (url.startsWith("/api/job-seekers/profile")) return { ok: true, json: async () => ({ profile }) } as Response;
      const params = new URL(url, "http://x").searchParams;
      const search = (params.get("search") ?? "").toLowerCase();
      const results = search === "tirur" ? [{ _id: "c2", name: "Tirur" }] : [];
      return { ok: true, json: async () => ({ results }) } as Response;
    }) as unknown as typeof fetch;
  }

  it("opens with the profile's town already picked when the area is missing", async () => {
    mockProfile({ area: null, currentLocation: "Tirur, Kerala, India", phone: "+91 9876543210" });
    render(<SeekerAreaPrompt />);
    expect(await screen.findByText("Where are you based?")).toBeInTheDocument();
    expect(await screen.findByText(/from your profile/i)).toBeInTheDocument();
  });

  it("stays closed when the profile already has an area", async () => {
    mockProfile({ area: { cityId: "c2" }, currentLocation: "Tirur" });
    render(<SeekerAreaPrompt />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Where are you based?")).not.toBeInTheDocument();
  });

  it("stays closed after Not now in this browser session", async () => {
    window.sessionStorage.setItem("mployedin.seekerAreaPrompt.dismissed", "1");
    mockProfile({ area: null, currentLocation: "Tirur" });
    render(<SeekerAreaPrompt />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Where are you based?")).not.toBeInTheDocument();
  });
});
