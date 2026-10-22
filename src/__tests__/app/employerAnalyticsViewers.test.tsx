/**
 * Unique views now count signed-in viewers only (no tracking cookie, PECR), so
 * the employer's Performance tab must say so, and say that older figures also
 * include signed-out visitors.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import EmployerAnalyticsPage from "@/app/[locale]/(dashboard)/employer/analytics/page";

const refetch = jest.fn();
const idle = { data: undefined, refetch };

const performanceData = {
  jobs: [
    {
      jobId: "j1",
      title: "Site Engineer",
      status: "active",
      views: 120,
      uniqueViews: 17,
      applications: 9,
      conversionRate: 7.5, // 9 applications / 120 views
      avgMatchScore: 71,
      createdAt: "2026-10-01",
      daysActive: 20,
    },
  ],
  summary: {
    totalJobs: 1,
    activeJobs: 1,
    totalViews: 120,
    totalUniqueViews: 17,
    totalApplications: 9,
    overallConversion: 7.5,
    underperforming: 0,
  },
};

jest.mock("@/hooks/useAnalytics", () => ({
  useAnalyticsOverview: () => ({ data: undefined, error: null, isLoading: false, refetch }),
  useAnalyticsPipeline: () => idle,
  useAnalyticsHistorical: () => idle,
  useAnalyticsJobs: () => ({ data: performanceData, refetch }),
  useAnalyticsResponseTime: () => idle,
  useAnalyticsOffers: () => idle,
  useDiversityReport: () => idle,
}));

function openPerformanceTab() {
  render(<EmployerAnalyticsPage />);
  fireEvent.click(screen.getByRole("button", { name: /^performance$/i }));
}

describe("employer analytics, Performance tab: signed-in viewers", () => {
  it("labels the summary card and the table column 'Signed-in viewers', not 'Unique'", () => {
    openPerformanceTab();

    // Card (label + value) and column header.
    expect(screen.getAllByText("Signed-in viewers")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Signed-in viewers" })).toBeInTheDocument();
    expect(screen.queryByText(/unique/i)).not.toBeInTheDocument();
    expect(screen.getByText("17", { selector: "p" })).toBeInTheDocument();
  });

  it("explains what the figure counts and that older figures include signed-out visitors", () => {
    openPerformanceTab();

    expect(
      screen.getByText(
        "Signed-in viewers counts signed-in visitors only. Figures from before this change also include signed-out visitors.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the total Views card and column", () => {
    openPerformanceTab();

    expect(screen.getByRole("columnheader", { name: "Views" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Site Engineer/ });
    expect(within(row).getByText("120")).toBeInTheDocument();
  });
});

describe.each([
  ["en", en],
  ["ar", ar],
] as const)("%s employerAnalytics viewer copy", (_locale, messages) => {
  it("has the signed-in viewer keys", () => {
    const ns = messages.employerAnalytics as Record<string, unknown>;
    for (const key of ["signedInViewersCard", "signedInViewersCol", "signedInViewersNote"]) {
      expect(typeof ns[key]).toBe("string");
      expect((ns[key] as string).trim()).not.toBe("");
    }
  });

  it("names the metric in the note, using the same words as the card and the column", () => {
    const ns = messages.employerAnalytics as Record<string, string>;

    expect(ns.signedInViewersCol).toBe(ns.signedInViewersCard);
    expect(ns.signedInViewersNote).toContain(ns.signedInViewersCard);
  });
});

describe("ar signed-in viewers wording", () => {
  const ns = ar.employerAnalytics as Record<string, string>;

  it("uses the natural 'المشاهدون المسجَّل دخولهم' for the label", () => {
    expect(ns.signedInViewersCard).toBe("المشاهدون المسجَّل دخولهم");
    expect(ns.signedInViewersCol).toBe("المشاهدون المسجَّل دخولهم");
  });

  it("no longer carries the ungrammatical 'المسجّلو الدخول'", () => {
    for (const key of ["signedInViewersCard", "signedInViewersCol", "signedInViewersNote"]) {
      expect(ns[key]).not.toContain("المسجّلو");
    }
  });
});
