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

jest.mock("@/components/shared/ThemeToggle", () => ({
  ThemeToggle: () => <button aria-label="theme-toggle">Theme</button>,
}));

describe("JobSeekerOnboardingPage", () => {
  it("renders the shared theme toggle in the onboarding top bar", () => {
    render(<JobSeekerOnboardingPage />);

    expect(screen.getByRole("button", { name: /theme-toggle/i })).toBeInTheDocument();
    expect(screen.getByText("App theme")).toBeInTheDocument();
    expect(screen.getByText("Applies after onboarding")).toBeInTheDocument();
    expect(screen.getByText("Welcome, X Beat")).toBeInTheDocument();
  });
});