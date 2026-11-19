/**
 * @jest-environment jsdom
 *
 * A super agent's matching list for a job: the profile opens beside the list,
 * and its CV opens in the viewer on the Standardised CV (primary "View CV"),
 * or on the uploaded file from the secondary "Original CV (Uploaded)" item.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => "/en/super-agent/jobs/job1/matches",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("@/components/features/jobs/matching/JobMatches", () => ({
  JobMatches: (props: { onViewProfile: (candidate: { jobSeekerId: string }) => void }) => (
    <button type="button" onClick={() => props.onViewProfile({ jobSeekerId: "a".repeat(24) })}>
      Open candidate
    </button>
  ),
}));

jest.mock("@/components/shared/ResumeViewerModal", () => ({
  ResumeViewerModal: (props: { url: string; initialSource?: string }) => (
    <div data-testid="viewer" data-url={props.url} data-source={props.initialSource ?? ""} />
  ),
}));

import { SuperAgentJobMatches } from "@/components/features/super-agent/SuperAgentJobMatches";

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      jobSeeker: {
        _id: "a".repeat(24),
        userId: { name: "Sara Ahmed", email: "sara@example.com" },
        createdAt: "2026-01-01T00:00:00.000Z",
        cv: { originalUrl: "/files/sara.pdf" },
      },
      applications: [],
    }),
  })) as unknown as typeof fetch;
});

it("opens the Standardised CV from the primary View CV button", async () => {
  render(<SuperAgentJobMatches locale="en" jobId="job1" />);
  await userEvent.click(screen.getByRole("button", { name: "Open candidate" }));
  await userEvent.click(await screen.findByRole("button", { name: "View CV" }));

  const viewer = await screen.findByTestId("viewer");
  expect(viewer).toHaveAttribute("data-url", `/api/employers/candidates/${"a".repeat(24)}/cv#cv.pdf`);
  expect(viewer).toHaveAttribute("data-source", "");
});

it("opens the uploaded file from the secondary Original CV (Uploaded) item", async () => {
  render(<SuperAgentJobMatches locale="en" jobId="job1" />);
  await userEvent.click(screen.getByRole("button", { name: "Open candidate" }));
  await userEvent.click(await screen.findByRole("button", { name: "More ways to open the CV" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" }));

  expect(await screen.findByTestId("viewer")).toHaveAttribute("data-source", "file");
});
