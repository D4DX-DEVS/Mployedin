/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { HeroSection } from "@/components/features/public/landing/HeroSection";
import { StatsSection } from "@/components/features/public/landing/StatsSection";
import { CountriesSection } from "@/components/features/public/landing/CountriesSection";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function renderHero(audience: "jobSeeker" | "employer" = "jobSeeker", onAudienceChange = jest.fn()) {
  return render(<HeroSection locale="en" audience={audience} onAudienceChange={onAudienceChange} />);
}

describe("landing hero", () => {
  it("is a plain search form that opens the jobs page with the job and the place", () => {
    renderHero();
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "GET");
    expect(form).toHaveAttribute("action", "/en/jobs");
    expect(screen.getByLabelText(/what role are you looking for/i)).toHaveAttribute("name", "search");
    expect(screen.getByLabelText(/where do you want to work/i)).toHaveAttribute("name", "location");
    expect(screen.getByRole("button", { name: /find jobs/i })).toHaveAttribute("type", "submit");
  });

  it("links the popular searches straight to the jobs page", () => {
    renderHero();
    expect(screen.getByRole("link", { name: "Engineering jobs" })).toHaveAttribute("href", "/en/jobs?search=Engineering%20jobs");
  });

  it("makes no AI request and shows no AI wording", () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    renderHero();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/search with ai/i)).not.toBeInTheDocument();
  });

  it("switches audience through the toggle", () => {
    const onAudienceChange = jest.fn();
    renderHero("jobSeeker", onAudienceChange);
    fireEvent.click(screen.getByRole("button", { name: "Hire talent" }));
    expect(onAudienceChange).toHaveBeenCalledWith("employer");
    expect(screen.getByRole("button", { name: "Find a job" })).toHaveAttribute("aria-pressed", "true");
  });

  it("gives employers sign-up links instead of the job search", () => {
    renderHero("employer");
    expect(screen.getByRole("link", { name: /start hiring/i })).toHaveAttribute("href", "/en/employer-register");
    expect(screen.getByRole("link", { name: /employer sign in/i })).toHaveAttribute("href", "/en/login");
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });
});

describe("landing numbers", () => {
  const stats = {
    activeJobs: 1236,
    verifiedEmployers: 0,
    countries: 18,
    placementsThisMonth: 0,
    remoteJobs: 73,
    topCountries: [{ name: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة", count: 412 }, { name: "India", nameAr: "", count: 71 }],
  };

  it("shows real numbers and leaves out the ones that are zero", () => {
    render(<StatsSection locale="en" stats={stats} />);
    expect(screen.getByText("1,236")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.queryByText("Verified employers")).not.toBeInTheDocument();
  });

  it("renders nothing when the numbers could not be loaded", () => {
    const { container } = render(<StatsSection locale="en" stats={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists countries by name with a link to their jobs, plus remote", () => {
    render(<CountriesSection locale="en" stats={stats} />);
    expect(screen.getByRole("link", { name: /united arab emirates/i })).toHaveAttribute("href", "/en/jobs?location=United%20Arab%20Emirates");
    expect(screen.getByRole("link", { name: /india/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /remote/i })).toHaveAttribute("href", "/en/jobs?location=Remote");
  });

  it("names a country in Arabic when the master list has the Arabic name", () => {
    render(<CountriesSection locale="ar" stats={stats} />);
    expect(screen.getByRole("link", { name: /الإمارات العربية المتحدة/ })).toHaveAttribute("href", "/ar/jobs?location=United%20Arab%20Emirates");
  });
});
