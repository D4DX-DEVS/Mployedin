/**
 * @jest-environment jsdom
 */
import type React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { JobSeekerHomePage, type InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/ar/job-seeker",
}));

// Keys, not copy: the messages files are edited elsewhere. `t("a.b")` → "a.b".
jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslations: () => (key: string) => key,
}));

const baseStats: InitialHomeData["stats"] = {
  applicationsSent: { count: 3, delta: 2, daily: [0, 1, 0, 0, 1, 1, 0] },
  upcomingInterviews: { count: 0, delta: 0 },
  recruiterViews: { total: 12, delta: -1, last7Days: [1, 2, 3, 1, 2, 2, 1] },
  pendingOffers: { count: 0 },
  unreadMessages: { count: 4 },
  jobAlerts: { count: 1 },
  statusBreakdown: { applied: 2, shortlisted: 1, interview_scheduled: 0, selected: 0, offer: 0, hired: 0, rejected: 0, withdrawn: 0 },
};

const initialData: InitialHomeData = {
  profile: {
    userId: "u1",
    preferredRoles: ["Frontend Developer"],
    preferredCountries: [],
    skills: [],
    experience: [],
    education: [],
    languages: [],
    profileCompleteness: 42,
  },
  stats: baseStats,
  jobs: [],
  appliedJobs: [
    { _id: "j1", title: "React Developer", companyName: "Acme", status: "shortlisted", appliedAt: new Date().toISOString() },
    { _id: "j2", title: "UI Engineer", companyName: "Globex", status: "rejected", appliedAt: new Date().toISOString() },
  ],
  interviews: [],
};

const job = (id: string) => ({
  _id: id,
  title: `Job ${id}`,
  createdAt: new Date("2026-09-20").toISOString(),
  matchScore: 88,
  skills: [],
  matchedSkills: [],
});

const withRecommendation = (jobs: ReturnType<typeof job>[], limitingFactor: string | null, bestScore = 64): InitialHomeData => ({
  ...initialData,
  jobs,
  recommendation: { threshold: 80, bestScore, recommendedCount: jobs.length, limitingFactor: limitingFactor as never },
});

describe("JobSeekerHomePage", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("renders one overview: header with ring and quick actions, KPI strip, then the panels", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={initialData} userName="Muhammed Ilyas MK" />);

    // Header: greeting, completeness ring with its CTA, four quick actions.
    // Greets by the local hour once mounted; any of the four lines is fine.
    expect(await screen.findByRole("heading", { level: 1, name: /^greeting\.(hello|morning|afternoon|evening)$/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "profileMini.complete: 10%" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "header.completeProfile" })).toHaveAttribute("href", "/ar/job-seeker/profile");
    const quick = screen.getByRole("navigation", { name: "header.quickActionsLabel" });
    expect(within(quick).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/ar/job-seeker/jobs",
      "/ar/job-seeker/cv",
      "/ar/job-seeker/saved-searches",
      "/ar/job-seeker/messages",
    ]);

    // KPI strip: six tiles with the stored counts and this week's change.
    const strip = document.querySelector("[data-kpi-strip]")!;
    const tiles = within(strip as HTMLElement).getAllByRole("link");
    expect(tiles).toHaveLength(6);
    expect(within(strip as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText("12")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByLabelText("kpi.deltaUp")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByLabelText("kpi.deltaDown")).toBeInTheDocument();

    // Panels, top to bottom.
    for (const title of ["recommendedJobs.forYou", "statusBreakdown.title", "recentApplications.title", "interviews.title", "boost.title"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }

    // Nothing was fetched: the server's data is final.
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
  });

  it("lists recent applications with a status badge and the next step", () => {
    render(<JobSeekerHomePage locale="ar" initialData={initialData} />);
    expect(screen.getByText("React Developer")).toBeInTheDocument();
    expect(screen.getByText("statuses.shortlisted")).toBeInTheDocument();
    expect(screen.getByText(/recentApplications\.nextStep\.shortlisted/)).toBeInTheDocument();
    expect(screen.getByText("statuses.rejected")).toBeInTheDocument();
  });

  it("names the profile gaps that would boost matches, biggest lever first", () => {
    render(<JobSeekerHomePage locale="ar" initialData={initialData} />);
    const boost = screen.getByRole("heading", { level: 2, name: "boost.title" }).closest("section")!;
    const rows = within(boost).getAllByRole("link").filter((a) => a.textContent?.startsWith("suggestions."));
    expect(rows[0]).toHaveTextContent("suggestions.resume.title");
    expect(rows[0]).toHaveAttribute("href", "/ar/job-seeker/cv");
    expect(rows[1]).toHaveTextContent("suggestions.skills.title");
  });

  it("says the profile is complete instead of asking for more", () => {
    render(
      <JobSeekerHomePage
        locale="ar"
        initialData={{
          ...initialData,
          profile: {
            userId: "u1",
            nationality: "IN",
            currentLocation: "Dubai",
            summary: "x",
            skills: ["React"],
            experience: [{}],
            education: [{}],
            languages: [{}],
            linkedin: "https://linkedin.com/in/x",
            preferredRoles: ["Dev"],
            cvFileUrl: "/cv.pdf",
          },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "header.viewProfile" })).toBeInTheDocument();
    expect(screen.getByText("boost.allDoneHint")).toBeInTheDocument();
  });

  it("fetches the profile, stats, recommendations and applications when it has no server data", async () => {
    render(<JobSeekerHomePage locale="ar" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(urls).toEqual(
      expect.arrayContaining([
        "/api/job-seeker/profile",
        "/api/dashboard/stats",
        expect.stringMatching(/^\/api\/jobs\/recommended\?limit=\d+&sort=match&recommended=true$/),
        "/api/applications?limit=5&page=1",
      ]),
    );
  });

  // "Recommended for you" lists only what the engine recommends. When that is
  // nothing — or fewer than four — the panel says so and says why, instead of
  // filling the slots with weaker jobs under this heading.
  it("explains an empty list and sends a profile gap to the profile", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "no_skills")} />);
    expect(await screen.findByText("recommendedJobs.strongOnlyTitle")).toBeInTheDocument();
    expect(screen.getByText("recommendedJobs.strongOnlyBody")).toBeInTheDocument();
    expect(screen.getByText("recommendedJobs.blockers.no_skills")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "recommendedJobs.improveProfileCta" })).toHaveAttribute("href", "/ar/job-seeker/profile");
  });

  it("asks where the seeker wants to work when no country is known, without quoting a score", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "no_location")} />);
    expect(await screen.findByText("recommendedJobs.noLocationTitle")).toBeInTheDocument();
    expect(screen.getByText("recommendedJobs.blockers.no_location")).toBeInTheDocument();
    expect(screen.queryByText("recommendedJobs.strongOnlyBody")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "recommendedJobs.addCountryCta" })).toHaveAttribute("href", "/ar/job-seeker/preferences");
  });

  it("sends a preference gate to the preferences page", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "country")} />);
    expect(await screen.findByText("recommendedJobs.blockers.country")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "recommendedJobs.updatePreferencesCta" })).toHaveAttribute("href", "/ar/job-seeker/preferences");
  });

  it("does not quote a closest match when nothing was eligible", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "country", 0)} />);
    expect(await screen.findByText("recommendedJobs.strongOnlyBodyNone")).toBeInTheDocument();
    expect(screen.queryByText("recommendedJobs.strongOnlyBody")).not.toBeInTheDocument();
  });

  it("says there are no other strong matches when it has fewer than four", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([job("a"), job("b")], null)} />);
    expect(await screen.findByText("recommendedJobs.noOtherStrong")).toBeInTheDocument();
    expect(screen.queryByText("recommendedJobs.strongOnlyTitle")).not.toBeInTheDocument();
  });

  it("adds no note when all four slots hold strong matches", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([job("a"), job("b"), job("c"), job("d")], null)} />);
    await screen.findAllByRole("link", { name: /viewJob/ });
    expect(screen.queryByText("recommendedJobs.noOtherStrong")).not.toBeInTheDocument();
  });
});
