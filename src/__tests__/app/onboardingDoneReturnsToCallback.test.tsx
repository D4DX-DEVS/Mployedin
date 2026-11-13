/**
 * @jest-environment jsdom
 *
 * Finishing onboarding marks the session onboarded, which runs the page's
 * "already onboarded" guard. It used to send everyone to the dashboard,
 * overriding the push to ?callbackUrl — a seeker who came from a job they
 * were applying to (Apply without CV) never got back to it.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import JobSeekerOnboardingPage from "@/app/[locale]/(onboarding)/onboarding/page";

const mockReplace = jest.fn();
let mockSearch = "";
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "QA Seeker", role: "job_seeker", isOnboarded: true } },
    status: "authenticated",
    update: jest.fn(),
  }),
  signOut: jest.fn(),
}));

beforeEach(() => {
  mockReplace.mockReset();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ profile: null }) }) as unknown as typeof fetch;
});

describe("onboarding page, once onboarded", () => {
  it("returns to the callback — the job being applied to", async () => {
    mockSearch = "callbackUrl=%2Fen%2Fjobs%2Fjob1";
    render(<JobSeekerOnboardingPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/en/jobs/job1"));
    expect(mockReplace).not.toHaveBeenCalledWith("/en/job-seeker");
  });

  it("goes to the dashboard when there is no callback", async () => {
    mockSearch = "";
    render(<JobSeekerOnboardingPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/en/job-seeker"));
  });
});
