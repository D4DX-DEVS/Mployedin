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
});