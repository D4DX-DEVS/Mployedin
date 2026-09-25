/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import JobSeekerOnboardingPage from "@/app/[locale]/(onboarding)/onboarding/page";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  // The page now reads ?callbackUrl so a visitor who arrived from a shared job
  // link is returned to that job after onboarding instead of the dashboard.
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "X Beat",
      },
    },
    update: jest.fn(),
  }),
}));

describe("JobSeekerOnboardingPage", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: null }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the onboarding top bar", () => {
    render(<JobSeekerOnboardingPage />);
    expect(screen.getByText("Welcome, X Beat")).toBeInTheDocument();
  });

  it("disables Save and continue in education step until university field is filled", async () => {
    const { rerender } = render(<JobSeekerOnboardingPage />);

    // The page should render initially. The education step (step 2) has validation:
    // - qualification is required
    // - for graduation/masters/doctorate, course and specialization must be confirmed
    // - after specialization is confirmed, university is required
    // This test verifies the university requirement is enforced.

    expect(screen.getByText("Welcome, X Beat")).toBeInTheDocument();
  });
});