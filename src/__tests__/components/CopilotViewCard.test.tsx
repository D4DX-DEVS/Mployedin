/**
 * @jest-environment jsdom
 *
 * The cards Copilot draws for a read tool's rows. Labels come from the
 * `copilot` and `statusBadge` namespaces; a status without a badge label falls
 * back to readable text instead of a raw key.
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import { CopilotViewCard } from "@/components/shared/Copilot/CopilotViewCard";
import type { CopilotView } from "@/lib/ai/copilot/views";

const STATUS_LABELS: Record<string, string> = { applied: "Applied", shortlisted: "Shortlisted", new: "New" };

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next-intl", () => {
  // One stable function per namespace, as next-intl gives a component.
  const cache: Record<string, ((key: string, values?: Record<string, unknown>) => string) & { has: (key: string) => boolean }> = {};
  return {
    useLocale: () => "en",
    useTranslations: (ns: string) => {
      if (!cache[ns]) {
        const t = ((key: string, values?: Record<string, unknown>) =>
          ns === "statusBadge"
            ? STATUS_LABELS[key]
            : `${ns}.${key}${values ? ` ${Object.values(values).join(",")}` : ""}`) as (typeof cache)[string];
        t.has = (key: string) => ns === "statusBadge" && key in STATUS_LABELS;
        cache[ns] = t;
      }
      return cache[ns];
    },
  };
});

const renderView = (view: CopilotView) => render(<CopilotViewCard view={view} onInternalLink={jest.fn()} />);

describe("CopilotViewCard", () => {
  it("draws job cards that link in-app, with the match, the badges and the skills", () => {
    renderView({
      kind: "jobs",
      jobs: [
        {
          jobId: "a",
          title: "Frontend Developer",
          company: "Acme",
          location: "Dubai, UAE",
          salary: "AED 8000-12000 monthly",
          matchScore: 91,
          strongMatch: true,
          skills: ["React", "TypeScript", "CSS", "Redux"],
          alreadyApplied: true,
          url: "/en/job-seeker/jobs/a",
        },
      ],
      more: 2,
    });
    expect(screen.getByRole("link", { name: "Frontend Developer" })).toHaveAttribute("href", "/en/job-seeker/jobs/a");
    expect(screen.getByText("91%")).toHaveAttribute("aria-label", "copilot.views.matchLabel 91");
    expect(screen.getByText("copilot.views.strongMatch")).toBeInTheDocument();
    expect(screen.getByText("copilot.views.alreadyApplied")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("AED 8000-12000 monthly")).toBeInTheDocument();
    // Three skills per card keep it to one line on a phone.
    expect(screen.getByText("CSS")).toBeInTheDocument();
    expect(screen.queryByText("Redux")).not.toBeInTheDocument();
    expect(screen.getByText("copilot.previewMore 2")).toBeInTheDocument();
  });

  it("never links a job url that leaves the site", () => {
    renderView({
      kind: "jobs",
      jobs: [{ jobId: "x", title: "Odd job", location: "Remote", skills: [], alreadyApplied: false, url: "https://evil.example/jobs/x" }],
      more: 0,
    });
    expect(screen.getByText("Odd job")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("draws candidate rows with the status label, the match and the experience", () => {
    renderView({
      kind: "candidates",
      candidates: [{ id: "app1", name: "Alice", job: "Frontend Developer", status: "shortlisted", matchScore: 88, experienceYears: 5, skills: ["React"] }],
      more: 0,
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText(/Frontend Developer · copilot\.views\.years 5/)).toBeInTheDocument();
  });

  it("draws application rows and spells out a status that has no badge label", () => {
    renderView({
      kind: "applications",
      applications: [{ title: "Designer", status: "interview_scheduled", appliedAt: "2026-10-01T09:00:00.000Z", matchScore: 72 }],
      more: 0,
    });
    expect(screen.getByText("Designer")).toBeInTheDocument();
    expect(screen.getByText("interview scheduled")).toBeInTheDocument();
    expect(screen.getByText(/copilot\.views\.appliedOn .*2026/)).toBeInTheDocument();
  });

  it("draws stat tiles and the per-job bars", () => {
    renderView({
      kind: "stats",
      tiles: [
        { metric: "total", value: 12 },
        { status: "new", value: 5 },
      ],
      rows: [
        { label: "Busy job", value: 9 },
        { label: "Quiet job", value: 0 },
      ],
    });
    expect(screen.getByText("copilot.views.metric.total")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("copilot.views.perJob")).toBeInTheDocument();
    expect(screen.getByText("Busy job")).toBeInTheDocument();
    expect(screen.getByText("Quiet job")).toBeInTheDocument();
  });
});
