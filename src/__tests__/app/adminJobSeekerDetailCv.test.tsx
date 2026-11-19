/**
 * @jest-environment jsdom
 *
 * Admin job seeker detail page: "View CV" opens the Standardised CV (Mployedin),
 * the secondary "Original CV (Uploaded)" opens the file they sent, and the
 * download button says it is the original.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminJobSeekerDetailPage from "@/app/[locale]/(dashboard)/admin/job-seekers/[id]/page";

const SEEKER_ID = "64b000000000000000000007";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => `/en/admin/job-seekers/${SEEKER_ID}`,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "64b000000000000000000007", locale: "en" }),
}));

jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: { url: string; initialSource?: string }) => (
    <div data-testid="viewer" data-url={props.url} data-source={props.initialSource ?? ""} />
  ),
}));

const fetchMock = jest.fn();

function mockSeeker(over: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      jobSeeker: {
        _id: SEEKER_ID,
        fullName: "Sara Ahmed",
        email: "sara@example.com",
        createdAt: "2026-10-01T00:00:00Z",
        cv: { originalUrl: "https://cdn/sara.pdf" },
        ...over,
      },
      applications: [],
    }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => fetchMock.mockReset());

describe("admin job seeker detail: CV buttons", () => {
  it("View CV is the primary button and opens the Standardised CV, not the file", async () => {
    mockSeeker();
    render(<AdminJobSeekerDetailPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "View CV" }));

    const viewer = screen.getByTestId("viewer");
    expect(viewer).toHaveAttribute("data-url", `/api/employers/candidates/${SEEKER_ID}/cv#cv.pdf`);
    expect(viewer).toHaveAttribute("data-source", "");
  });

  it("Original CV (Uploaded) opens the file they sent", async () => {
    mockSeeker();
    render(<AdminJobSeekerDetailPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Original CV (Uploaded)" }));

    expect(screen.getByTestId("viewer")).toHaveAttribute("data-source", "file");
  });

  it("the download button says it is the original file", async () => {
    mockSeeker();
    render(<AdminJobSeekerDetailPage />);

    expect(await screen.findByRole("button", { name: "Download original CV" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download CV" })).toBeNull();
  });

  it("with no upload, View CV is still offered (the Standardised CV is made from the profile) and there is no original to open", async () => {
    mockSeeker({ cv: undefined });
    render(<AdminJobSeekerDetailPage />);

    expect(await screen.findByRole("button", { name: "View CV" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Original CV (Uploaded)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download original CV" })).toBeNull();
    expect(screen.getByText("No CV uploaded yet")).toBeInTheDocument();
  });
});
