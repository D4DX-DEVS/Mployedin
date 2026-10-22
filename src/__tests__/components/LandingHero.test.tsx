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

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function renderHero(audience: "jobSeeker" | "employer" = "jobSeeker", onAudienceChange = jest.fn()) {
  return render(<HeroSection locale="en" audience={audience} onAudienceChange={onAudienceChange} />);
}

function type(sentence: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: sentence } });
}

describe("landing hero search", () => {
  beforeEach(() => push.mockClear());

  it("reads a role and a place out of the sentence as the visitor types", () => {
    renderHero();
    type("Nursing roles in Abu Dhabi");
    expect(screen.getByText("Role: Nursing")).toBeInTheDocument();
    expect(screen.getByText("Location: Abu Dhabi")).toBeInTheDocument();
  });

  it("opens the jobs page with what was understood when searching", () => {
    renderHero();
    type("Site engineer in Dubai");
    fireEvent.click(screen.getByRole("button", { name: /find jobs/i }));
    expect(push).toHaveBeenCalledWith("/en/jobs?search=Site+engineer&location=Dubai");
  });

  it("searches on Enter and adds a new line on Shift+Enter", () => {
    renderHero();
    type("accountant in Doha");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/en/jobs?search=accountant&location=Doha");
  });

  it("leaves out a filter the visitor removed", () => {
    renderHero();
    type("Site engineer in Dubai");
    fireEvent.click(screen.getByRole("button", { name: /remove filter: location: dubai/i }));
    expect(screen.queryByText("Location: Dubai")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /find jobs/i }));
    expect(push).toHaveBeenCalledWith("/en/jobs?search=Site+engineer");
  });

  it("brings the filters back when the sentence is edited", () => {
    renderHero();
    type("Site engineer in Dubai");
    fireEvent.click(screen.getByRole("button", { name: /remove filter: location: dubai/i }));
    type("Site engineer in Doha");
    expect(screen.getByText("Location: Doha")).toBeInTheDocument();
  });

  it("opens the plain jobs list for an empty sentence", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: /find jobs/i }));
    expect(push).toHaveBeenCalledWith("/en/jobs");
  });

  it("fills the box from an example and puts the cursor there", () => {
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "Nursing roles in Abu Dhabi" }));
    expect(screen.getByRole("textbox")).toHaveValue("Nursing roles in Abu Dhabi");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByText("Location: Abu Dhabi")).toBeInTheDocument();
  });

  it("makes no network request and shows no AI wording", () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    renderHero();
    type("nurse in doha");
    fireEvent.click(screen.getByRole("button", { name: /find jobs/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/AI/)).not.toBeInTheDocument();
  });

  it("switches audience through the toggle", () => {
    const onAudienceChange = jest.fn();
    renderHero("jobSeeker", onAudienceChange);
    fireEvent.click(screen.getByRole("button", { name: "Hire talent" }));
    expect(onAudienceChange).toHaveBeenCalledWith("employer");
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
