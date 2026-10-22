/**
 * @jest-environment jsdom
 *
 * The poster editor's unsaved edits are the employer's own work, so they are
 * kept in the tab (sessionStorage) like a job post draft: never in localStorage,
 * whatever the visitor chose about cookies, and not under the preferences
 * category. A copy an older build left in localStorage is deleted on page load
 * (CookieConsent.test.tsx), not carried over.
 */
import fs from "fs";
import path from "path";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { writeConsent } from "@/lib/consent/client";
import { POSTER_EDIT_PREFIX, posterEditKey } from "@/lib/consent/deviceStorage";

let mockParams = new URLSearchParams("generation=gen1");
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }));

const mockHydrate = jest.fn();
jest.mock("@/hooks/usePosterAI", () => ({
  usePosterGenerate: () => ({
    variations: [],
    selectedIndex: 0,
    isGenerating: false,
    isGeneratingMore: false,
    error: null,
    shareSlug: null,
    generationId: null,
    generate: jest.fn(),
    generateMore: jest.fn(),
    setSelectedIndex: jest.fn(),
    hydrate: mockHydrate,
  }),
}));
jest.mock("@/hooks/usePosterCredits", () => ({ usePosterCredits: () => ({ credits: { remaining: 3 } }) }));
jest.mock("@/components/features/employer/poster/PosterTypeSelector", () => ({ PosterTypeSelector: () => null }));
jest.mock("@/components/features/employer/poster/PosterCustomizer", () => ({ PosterCustomizer: () => null }));
jest.mock("@/components/features/employer/poster/PosterVariationsGrid", () => ({ PosterVariationsGrid: () => null }));
jest.mock("@/components/features/employer/poster/CreditsBadge", () => ({ CreditsBadge: () => null }));
jest.mock("@/components/features/employer/poster/PosterOverlay", () => ({ PosterOverlay: () => null }));
jest.mock("@/components/features/employer/poster/exportPoster", () => ({ exportPosterPng: jest.fn() }));
jest.mock("qrcode", () => ({ __esModule: true, default: { toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,AAAA") } }));

import { CreatePosterPage } from "@/components/features/employer/poster/CreatePosterPage";
import { PosterPreviewPanel } from "@/components/features/employer/poster/PosterPreviewPanel";

const SAVED = { _id: "gen1", type: "single-job", variations: [], styleOverrides: { fontFamily: "Saved" }, layoutOverride: "layout-b" };
const SLOT = "poster-edit:gen1"; // the literal, so a renamed key cannot slip through the helper

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function stubFetch() {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
    if (url.startsWith("/api/employers/posters/")) return { ok: true, json: async () => SAVED };
    if (url.startsWith("/api/jobs/")) return { ok: true, json: async () => ({ job: { title: "Nurse" } }) };
    return { ok: false, json: async () => ({}) };
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "mpl_consent=; Max-Age=0; path=/";
  mockParams = new URLSearchParams("generation=gen1");
  mockHydrate.mockClear();
  stubFetch();
});

describe("poster edit key", () => {
  it("is the poster-edit: prefix plus the generation id", () => {
    expect(POSTER_EDIT_PREFIX).toBe("poster-edit:");
    expect(posterEditKey("gen1")).toBe("poster-edit:gen1");
  });
});

describe("PosterPreviewPanel autosave", () => {
  const variation = null;
  const props = {
    variation,
    job: null,
    posterType: "single-job" as const,
    showFields: { salary: true, location: true, experience: true, skills: true },
    formats: ["instagram-post" as const],
    shareSlug: null,
    generationId: "gen1",
  };

  it("writes the edits to sessionStorage and never to localStorage", async () => {
    render(withClient(<PosterPreviewPanel {...props} />));

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(SLOT) ?? "null")).toEqual({ look: {}, layout: null }));
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("does the same after preferences were objected to", async () => {
    writeConsent({ preferences: false, media: false });

    render(withClient(<PosterPreviewPanel {...props} />));

    await waitFor(() => expect(sessionStorage.getItem(SLOT)).not.toBeNull());
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("does not read a draft an older build left in localStorage", async () => {
    localStorage.setItem("poster-edit:gen1", JSON.stringify({ look: { fontFamily: "Old" }, layout: "layout-c" }));

    render(withClient(<PosterPreviewPanel {...props} />));

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(SLOT) ?? "null")).toEqual({ look: {}, layout: null }));
    expect(localStorage.getItem("poster-edit:gen1")).toContain("Old"); // the page-load sweep deletes it, not this component
  });

  it("writes nothing before there is a saved generation", () => {
    render(withClient(<PosterPreviewPanel {...props} generationId={null} />));

    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});

describe("CreatePosterPage seeding a saved poster into the autosave slot", () => {
  it("seeds the tab's slot from the saved generation, never localStorage", async () => {
    render(withClient(<CreatePosterPage jobId="job1" />));

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(SLOT) ?? "null")).toEqual({ look: { fontFamily: "Saved" }, layout: "layout-b" }));
    expect(Object.keys(localStorage)).toEqual([]);
    expect(mockHydrate).toHaveBeenCalled();
  });

  it("keeps newer edits already in the tab's slot", async () => {
    sessionStorage.setItem(SLOT, JSON.stringify({ look: { fontFamily: "Newer" }, layout: null }));

    render(withClient(<CreatePosterPage jobId="job1" />));

    await waitFor(() => expect(mockHydrate).toHaveBeenCalled());
    expect(JSON.parse(sessionStorage.getItem(SLOT) ?? "null")).toEqual({ look: { fontFamily: "Newer" }, layout: null });
  });

  it("does not treat an old localStorage copy as newer edits", async () => {
    localStorage.setItem("poster-edit:gen1", JSON.stringify({ look: { fontFamily: "Old" }, layout: null }));

    render(withClient(<CreatePosterPage jobId="job1" />));

    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(SLOT) ?? "null")).toEqual({ look: { fontFamily: "Saved" }, layout: "layout-b" }));
  });

  it("renders the page (the mocks stand in for the heavy children)", async () => {
    render(withClient(<CreatePosterPage jobId="job1" />));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});

/* A source guard: the heavy paths above are mocked, so also pin that neither file can reach localStorage. */
describe("poster editor sources", () => {
  const dir = path.join(process.cwd(), "src", "components", "features", "employer", "poster");
  for (const file of ["CreatePosterPage.tsx", "PosterPreviewPanel.tsx"]) {
    it(`${file} keeps its edits in tab storage only`, () => {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      expect(source).not.toMatch(/\blocalStorage\s*[.[]/);
      expect(source).not.toMatch(/prefStorage/);
      expect(source).not.toMatch(/legacyKeys/);
      expect(source).not.toMatch(/ui:poster-edit/);
      expect(source).toMatch(/posterEditKey\(/);
    });
  }
});
