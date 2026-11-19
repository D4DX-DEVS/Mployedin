/**
 * @jest-environment jsdom
 *
 * The employer's candidate profile page: "View CV" opens the viewer on the
 * candidate CV route (the one URL the viewer pairs with a Standardised CV), and
 * nothing on the page calls the CV a "Resume".
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UnifiedCandidatePage from "@/app/[locale]/(dashboard)/employer/candidates/[id]/page";

const SEEKER = "64b7c1f2a3d4e5f60718293a";
const APPLICATION = "64b7c1f2a3d4e5f60718293b";

const useCandidateDetailMock = jest.fn();
const resumeViewerMock = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en", id: "64b7c1f2a3d4e5f60718293a" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/hooks/useCandidates", () => ({
  useCandidateDetail: (...args: unknown[]) => useCandidateDetailMock(...args),
}));

// Records what the viewer is opened with.
jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: Record<string, unknown>) => {
    resumeViewerMock(props);
    return null;
  },
}));

jest.mock("@/components/shared/CvInlineFrame", () => ({
  CvInlineFrame: ({ url }: { url: string }) => <div data-testid="inline-cv" data-url={url} />,
}));

function detail(overrides: { applications?: unknown[]; cv?: unknown } = {}) {
  return {
    candidate: {
      _id: SEEKER,
      userId: { _id: "user-1", name: "Amina Noor", email: "amina@example.com" },
      skills: ["React"],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      cv: "cv" in overrides ? overrides.cv : { originalUrl: "https://example.com/cv.pdf" },
    },
    applications: overrides.applications ?? [
      { _id: APPLICATION, job: { _id: "job-1", title: "Frontend Engineer" }, status: "shortlisted", appliedAt: "2026-04-08T00:00:00.000Z", hasCv: true },
    ],
    interviews: [],
    timeline: [],
    notes: [],
    summary: { totalApplications: 1, totalInterviews: 0, totalNotes: 0, avgMatchScore: null },
  };
}

describe("employer candidate profile CV actions", () => {
  beforeEach(() => {
    resumeViewerMock.mockReset();
    useCandidateDetailMock.mockReset();
    useCandidateDetailMock.mockReturnValue({ data: detail(), isLoading: false });
  });

  it("opens the viewer on the candidate CV route with the application, so staff get the Standardised CV", async () => {
    const user = userEvent.setup();
    render(<UnifiedCandidatePage />);

    await user.click(screen.getByRole("button", { name: /^view cv$/i }));

    const url = (resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url;
    expect(url).toBe(`/api/employers/candidates/${SEEKER}/cv?applicationId=${APPLICATION}#cv.pdf`);
    // The viewer's own test for "this CV has a Mployedin version beside it".
    expect(url).toMatch(/^\/api\/employers\/candidates\/[a-f\d]{24}\/cv(?:[?#]|$)/i);
  });

  it("opens a talent-pool candidate (no application) on the profile CV, same route", async () => {
    useCandidateDetailMock.mockReturnValue({ data: detail({ applications: [] }), isLoading: false });
    const user = userEvent.setup();
    render(<UnifiedCandidatePage />);

    await user.click(screen.getByRole("button", { name: /^view cv$/i }));

    expect((resumeViewerMock.mock.calls.at(-1)?.[0] as { url: string }).url).toBe(`/api/employers/candidates/${SEEKER}/cv#cv.pdf`);
  });

  it("does not call the CV a Resume in a button or a heading", () => {
    render(<UnifiedCandidatePage />);

    expect(screen.queryByRole("button", { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^cv$/i })).toBeInTheDocument();
  });

  it("offers no CV actions when there is no CV", () => {
    useCandidateDetailMock.mockReturnValue({ data: detail({ applications: [], cv: undefined }), isLoading: false });
    render(<UnifiedCandidatePage />);

    expect(screen.queryByRole("button", { name: /^view cv$/i })).not.toBeInTheDocument();
  });
});
