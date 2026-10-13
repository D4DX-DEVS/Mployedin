/**
 * @jest-environment jsdom
 *
 * Client feedback (2026-10-12): "years of experience is also needed in
 * candidates detail table". It was only a small line under the name, read the
 * stored figure alone — which defaults to 0, so seekers with dated jobs but no
 * stated total showed "0 yrs experience". It is a column now, worked out from
 * the stated total or, failing that, the seeker's dated jobs.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/en/agent/candidates",
  useParams: () => ({ locale: "en" }),
}));

import AgentCandidatesPage from "@/app/[locale]/(dashboard)/agent/candidates/page";

const seeker = (name: string, extra: Record<string, unknown>) => ({
  _id: `js-${name}`,
  userId: { name, email: `${name}@x.test` },
  ...extra,
});
const row = (id: string, jobSeekerId: unknown) => ({
  _id: id,
  status: "applied",
  jobId: { _id: "job1", title: "Driver", employerId: { companyName: "Gulf Haulage" } },
  jobSeekerId,
  appliedAt: "2026-10-01T00:00:00.000Z",
});

beforeEach(() => {
  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => (String(url).startsWith("/api/applications?")
      ? {
          applications: [
            { ...row("a1", seeker("Stated", { totalExperienceYears: 6, currentLocation: "Tirur, Kerala" })), isPriority: true },
            row("a2", seeker("Dated", { totalExperienceYears: 0, experience: [{ startDate: "2020-01-01", endDate: "2022-06-30" }] })),
            row("a3", seeker("Unknown", { totalExperienceYears: 0, experience: [] })),
          ],
          total: 3,
        }
      : {}),
  })) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

const cellsOf = (name: string) => within(screen.getByText(name).closest("tr") as HTMLElement).getAllByRole("cell").map((c) => c.textContent?.trim());

it("shows an Experience column worked out from the stated total or the dated jobs", async () => {
  render(<AgentCandidatesPage />);

  expect(await screen.findByRole("columnheader", { name: "Experience" })).toBeInTheDocument();
  await screen.findByText("Stated");
  expect(cellsOf("Stated")).toContain("6 yrs");
  expect(cellsOf("Dated")).toContain("2 yrs 6 mos");
  expect(cellsOf("Unknown")).toContain("—");
  // The old line under the name read the 0 default as real experience.
  expect(screen.queryByText(/0 yrs experience/)).not.toBeInTheDocument();
});

// Owner, 2026-10-12: "each title, under that an icon … as we did in our other
// table" — the super agent jobs table's pattern: main value, then a small
// icon line (company, location, date) underneath.
it("puts the secondary details under each value with an icon, like the other tables", async () => {
  render(<AgentCandidatesPage />);
  await screen.findByText("Stated");

  const tr = screen.getByText("Stated").closest("tr") as HTMLElement;
  const iconBeside = (text: string) => within(tr).getByText(text).parentElement?.querySelector("svg");
  expect(iconBeside("Tirur, Kerala")).toBeTruthy();
  expect(iconBeside("Gulf Haulage")).toBeTruthy();
  expect(iconBeside("6 yrs")).toBeTruthy();
  expect(iconBeside("Oct 01, 2026")).toBeTruthy();
});

// Client decision 2026-10-12: a Premium job seeker's application is priority.
it("marks a Premium job seeker's application Priority, and only that one", async () => {
  render(<AgentCandidatesPage />);
  await screen.findByText("Stated");

  const badges = screen.getAllByTestId("priority-badge");
  expect(badges).toHaveLength(1);
  expect(screen.getByText("Stated").closest("tr")).toContainElement(badges[0]);
});
