/**
 * @jest-environment jsdom
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
  useSession: () => ({ data: { user: { name: "Shafeeq K N" } }, status: "authenticated", update: jest.fn() }),
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

const JOB_NOW = "a0000000000000000000e001";
const JOB_OLD = "a0000000000000000000e002";
const BCOM = "a0000000000000000000d001";
const MBA = "a0000000000000000000d002";

/** What cv-extract answers for the CV from the 2026-09-30 report. */
const extracted = {
  fullName: "SHAFEEQ K N",
  phone: "+91 97460 60086",
  headline: "Sales Manager | B2B & B2C Sales",
  currentLocation: "Kochi, Kerala",
  totalExperienceYears: 6,
  skills: ["B2B Sales", "CRM"],
  // The CV lists an older job first here, to prove the current one is chosen.
  experience: [
    { jobTitle: "Team Lead", company: "Autumn Rooms", from: "2023-05", to: "2024-06", current: false },
    { jobTitle: "Manager, Client Acquisition", company: "IndiaMART InterMESH Limited", from: "2025-03", to: "present", current: true },
  ],
  education: [
    { degree: "B.Com", field: "Marketing", institution: "Cochin College" },
    { degree: "MBA", field: "Finance & Marketing", institution: "Albertian Institute of Management (AIM)", from: "2017", to: "2019" },
  ],
};

/** The same reading as cv-extract stored it, with the ids the database gave each entry. */
const storedProfile = {
  fullName: "SHAFEEQ K N",
  currentLocation: "Kochi, Kerala",
  skills: ["B2B Sales", "CRM"],
  experience: [
    { _id: JOB_OLD, jobTitle: "Team Lead", company: "Autumn Rooms", startDate: "2023-05-01T00:00:00.000Z", endDate: "2024-06-01T00:00:00.000Z", isCurrent: false },
    { _id: JOB_NOW, jobTitle: "Manager, Client Acquisition", company: "IndiaMART InterMESH Limited", startDate: "2025-03-01T00:00:00.000Z", isCurrent: true },
  ],
  education: [
    { _id: BCOM, degree: "B.Com", field: "Marketing", institution: "Cochin College" },
    // The stored reading keeps no start year (normalizeParsedCv drops it); the raw one has it.
    { _id: MBA, degree: "MBA", field: "Finance & Marketing", institution: "Albertian Institute of Management (AIM)", graduationDate: "2019-12-31T00:00:00.000Z" },
  ],
};

const json = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as Response);

describe("onboarding CV import", () => {
  let fetchMock: jest.Mock;
  let cvRead = false;
  /** What cv-extract answers; a re-upload of the same file skips the AI read. */
  let extractReply: Record<string, unknown>;

  beforeEach(() => {
    cvRead = false;
    extractReply = { success: true, extracted };
    document.cookie = "csrf-token=test-token";
    fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/ai/cv-extract") {
        cvRead = true;
        return json(extractReply);
      }
      if (url === "/api/job-seekers/profile" && init?.method === "PATCH") {
        return json({ success: true, entryIds: { experience: JOB_NOW, education: MBA } });
      }
      if (url === "/api/job-seekers/profile") return json({ profile: cvRead ? storedProfile : null });
      if (url.startsWith("/api/filters/locations")) {
        return json({ results: url.includes("search=Cochin") && url.includes("country=IN") ? [{ _id: "city-cochin", name: "Cochin" }] : [] });
      }
      return json({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  async function importCv(typedPhone?: string) {
    await act(async () => { render(<JobSeekerOnboardingPage />); });
    if (typedPhone) {
      await act(async () => {
        fireEvent.change(screen.getByRole("textbox", { name: /mobile number/i }), { target: { value: typedPhone } });
      });
    }
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /i'm experienced/i })); });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF-1.7"], "shafeeq.pdf", { type: "application/pdf" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await waitFor(() => expect(saves().length).toBeGreaterThan(0));
    return saves()[0];
  }

  const saves = () => fetchMock.mock.calls
    .filter(([url, init]) => url === "/api/job-seekers/profile" && init?.method === "PATCH")
    .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);

  it("keeps the CV's phone country instead of putting its digits under +971", async () => {
    const saved = await importCv();
    expect(saved.phone).toBe("+919746060086");
  });

  it("uses the total the CV states, not the current job's length", async () => {
    const saved = await importCv();
    expect(saved.totalExperienceYears).toBe(6);
    expect(saved.totalExperienceMonths).toBe(0);
  });

  it("shows the current job and the highest degree, naming the stored entries so the others are kept", async () => {
    const saved = await importCv();
    expect(saved.experience).toEqual([expect.objectContaining({ _id: JOB_NOW, company: "IndiaMART InterMESH Limited", jobTitle: "Manager, Client Acquisition", isCurrent: true })]);
    expect(saved.education).toEqual([expect.objectContaining({ _id: MBA, degree: "Masters/Post-Graduation", course: "MBA", startYear: 2017, passingYear: 2019 })]);
  });

  it("fills the form from the saved reading when the same CV is uploaded again", async () => {
    // The stored reading keeps no phone; the seeker has typed theirs.
    extractReply = { success: true, duplicate: true, extracted: { ...extracted, phone: undefined } };
    const saved = await importCv("501234567");
    expect(screen.queryByText(/could not extract/i)).toBeNull();
    expect(saved.totalExperienceYears).toBe(6);
    expect(saved.experience).toEqual([expect.objectContaining({ _id: JOB_NOW })]);
  });

  it("still fills the form from the profile when a re-upload has no saved reading", async () => {
    extractReply = { success: true, duplicate: true };
    await act(async () => { render(<JobSeekerOnboardingPage />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /i'm experienced/i })); });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["%PDF"], "cv.pdf", { type: "application/pdf" })] } }); });
    await waitFor(() => expect(screen.getByText(/resume parsed/i)).toBeInTheDocument());
    expect(screen.queryByText(/could not extract/i)).toBeNull();
  });

  it("fills the area from the CV location, matching Kochi to the catalogue's Cochin", async () => {
    const saved = await importCv();
    expect(saved.cityId).toBe("city-cochin");
    // The CV's "Kochi, Kerala" names no country; the +91 phone decides it.
    const searches = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/filters/locations"));
    expect(searches).toEqual(["/api/filters/locations?search=Kochi&country=IN", "/api/filters/locations?search=Cochin&country=IN"]);
  });
});
