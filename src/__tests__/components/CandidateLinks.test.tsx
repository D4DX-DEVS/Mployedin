/**
 * @jest-environment jsdom
 *
 * "Portfolio link attached by job seeker not visible while employer reviewing"
 * (client sheet, 2026-09-30). The link was stored on the application as a
 * `portfolio` document, and the seeker's profile links in `socialLinks`, but
 * no employer screen rendered either. Only http(s) links may render — the
 * validators accept `javascript:` URLs (zod url()).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { CandidateLinks, candidateLinks, safeExternalUrl } from "@/components/features/employer/applications/CandidateLinks";

describe("safeExternalUrl", () => {
  it.each([
    ["https://behance.net/someone", "https://behance.net/someone"],
    ["http://example.com/cv", "http://example.com/cv"],
    ["www.example.com/portfolio", "https://www.example.com/portfolio"],
  ])("accepts %s", (input, expected) => {
    expect(safeExternalUrl(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hi", "", "   ", "not a url at all"])("rejects %p", (input) => {
    expect(safeExternalUrl(input)).toBeNull();
  });
});

describe("candidateLinks", () => {
  it("puts the application's portfolio first, then profile links, without duplicates or unsafe URLs", () => {
    const links = candidateLinks({
      documents: [
        { name: "CV", url: "https://cdn.example/cvs/a.pdf", type: "resume" },
        { name: "Portfolio", url: "https://dribbble.com/me", type: "portfolio" },
      ],
      socialLinks: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/me" },
        { label: "Portfolio", url: "https://dribbble.com/me" },
        { label: "Evil", url: "javascript:alert(1)" },
      ],
    });
    expect(links).toEqual([
      { label: "Portfolio", url: "https://dribbble.com/me", source: "application" },
      { label: "LinkedIn", url: "https://www.linkedin.com/in/me", source: "profile" },
    ]);
  });

  it("returns nothing when there are no links", () => {
    expect(candidateLinks({ documents: [{ name: "CV", url: "x", type: "resume" }] })).toEqual([]);
  });
});

describe("<CandidateLinks />", () => {
  function renderLinks(ui: React.ReactElement) {
    return render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
  }

  it("renders each link as a safe external anchor", () => {
    renderLinks(
      <CandidateLinks
        documents={[{ name: "Portfolio", url: "https://dribbble.com/me", type: "portfolio" }]}
        socialLinks={[{ label: "GitHub", url: "https://github.com/me" }]}
      />,
    );
    const portfolio = screen.getByRole("link", { name: /portfolio/i });
    expect(portfolio).toHaveAttribute("href", "https://dribbble.com/me");
    expect(portfolio).toHaveAttribute("target", "_blank");
    expect(portfolio).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "https://github.com/me");
    expect(screen.getByText("dribbble.com")).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = renderLinks(<CandidateLinks documents={[]} socialLinks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
