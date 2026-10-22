/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import LegalPage from "@/components/features/public/LegalPage";

let mockPathname = "/en/privacy";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

function mockPage(page: Record<string, unknown> | null) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: page !== null,
    json: async () => (page ? { page } : { error: "Page not found" }),
  }) as unknown as typeof fetch;
}

describe("LegalPage", () => {
  beforeEach(() => {
    mockPathname = "/en/privacy";
  });

  it("reads its own slug and heads the page with the title the admin saved", async () => {
    mockPage({ title: "Privacy notice", titleAr: "", body: "<p>We keep your data safe.</p>", updatedAt: "2026-09-28T10:00:00.000Z" });
    render(<LegalPage kind="privacy" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Privacy notice" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/public/pages/privacy-policy");
    expect(screen.getByText("We keep your data safe.")).toBeInTheDocument();
  });

  it("does not load a third-party <img> from the CMS body (the browser would contact that host before any cookie choice)", async () => {
    mockPage({
      title: "Privacy notice",
      body: '<p>Intro</p><img src="https://i.pravatar.cc/300" alt="third party"><img src="https://d4dx-storage.blr1.digitaloceanspaces.com/legal/seal.png" alt="own seal">',
      updatedAt: "2026-09-28T10:00:00.000Z",
    });
    const { container } = render(<LegalPage kind="privacy" />);

    expect(await screen.findByText("Intro")).toBeInTheDocument();
    expect(container.querySelector('img[src*="pravatar"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"))).toEqual([
      "https://d4dx-storage.blr1.digitaloceanspaces.com/legal/seal.png",
    ]);
  });

  it("dates the page from its last save, not a hardcoded 2023 string", async () => {
    mockPage({ title: "Terms", body: "<p>Terms body</p>", updatedAt: "2026-09-28T10:00:00.000Z" });
    render(<LegalPage kind="terms" />);

    expect(await screen.findByText(/Last updated: .*2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2023/)).not.toBeInTheDocument();
  });

  it("uses the Arabic title on the Arabic site", async () => {
    mockPathname = "/ar/gdpr";
    mockPage({ title: "GDPR", titleAr: "حماية البيانات", body: "<p>x</p>", bodyAr: "<p>ع</p>", updatedAt: "2026-09-28T10:00:00.000Z" });
    render(<LegalPage kind="gdpr" />);

    expect(await screen.findByRole("heading", { level: 1, name: "حماية البيانات" })).toBeInTheDocument();
  });

  it("serves the Accessibility Statement the admin edits in the CMS, in Arabic too", async () => {
    mockPathname = "/ar/accessibility";
    mockPage({ title: "Accessibility Statement", titleAr: "بيان إمكانية الوصول", body: "<p>x</p>", bodyAr: "<h2>التزامنا</h2>", updatedAt: "2026-09-29T10:00:00.000Z" });
    render(<LegalPage kind="accessibility" />);

    expect(await screen.findByRole("heading", { level: 1, name: "بيان إمكانية الوصول" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/public/pages/accessibility-statement");
    expect(screen.getByRole("heading", { level: 2, name: "التزامنا" })).toBeInTheDocument();
  });

  it("says the statement is being prepared until the admin publishes it", async () => {
    mockPathname = "/en/accessibility";
    mockPage(null);
    render(<LegalPage kind="accessibility" />);

    expect(await screen.findByText("Our accessibility statement is being prepared.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Accessibility Statement" })).toBeInTheDocument();
  });

  it("falls back to the default heading and shows no date when the page is not published", async () => {
    mockPage(null);
    render(<LegalPage kind="cookies" />);

    expect(await screen.findByText("Cookie policy content is being prepared.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Cookie Policy" })).toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});

// [LEGAL] The line under the Cookie Policy: it covers similar technologies too, and promises to ask only for what needs
// permission (PECR does not require asking before adding a strictly necessary cookie, and the site will not).
describe("LegalPage: the Cookie Policy's closing line", () => {
  it("says the policy lists every cookie and similar technology, and that we ask first only for one that needs permission", async () => {
    mockPathname = "/en/cookies";
    mockPage({ title: "Cookie Policy", body: "<p>Policy</p>" });
    render(<LegalPage kind="cookies" />);

    expect(
      await screen.findByText("This policy lists every cookie and similar technology we use. If we add one that needs your permission, we will ask you first."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/we will ask before adding any others/)).not.toBeInTheDocument();
  });
});
