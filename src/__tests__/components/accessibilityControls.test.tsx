/**
 * @jest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";

import LocaleLayout from "@/app/[locale]/layout";
import { MAIN_CONTENT_ID, SkipToContent } from "@/components/shared/SkipToContent";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("next/navigation", () => ({ notFound: jest.fn() }));
jest.mock("@/components/shared/PWAInstallPrompt", () => ({ PWAInstallPrompt: () => null }));

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("SkipToContent", () => {
  it("jumps to the main landmark", () => {
    render(<SkipToContent label="Skip to main content" />);

    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
  });

  it("is the first thing a keyboard user reaches on every page", async () => {
    render(
      await LocaleLayout({
        children: (
          <main id={MAIN_CONTENT_ID}>
            <a href="/en/jobs">Jobs</a>
          </main>
        ),
        params: Promise.resolve({ locale: "en" }),
      }),
    );

    const first = document.querySelector("a[href], button, input, select, textarea, [tabindex]");
    expect(first).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(first).toHaveTextContent("Skip to main content");
  });
});

describe("Accessibility panel button", () => {
  it("pins to a logical edge so Arabic mirrors it, and never uses physical left/right", () => {
    const src = read("src/components/shared/AccessibilityPanel/Launcher.tsx");

    expect(src).toMatch(/\bend-4\b/);
    expect(src).not.toMatch(/\b(?:left|right)-\d|\b[mp][lr]-\d|rounded-[lr]-/);
  });
});

describe("page landmarks", () => {
  // Every route group under [locale] (the root layout renders the skip link
  // for all of them) must carry the target, or the link does nothing there.
  it.each([
    "src/app/[locale]/(public)/layout.tsx",
    "src/app/[locale]/(auth)/layout.tsx",
    "src/app/[locale]/(onboarding)/layout.tsx",
    "src/components/shared/DashboardShell/index.tsx",
    "src/app/[locale]/maintenance/page.tsx",
    "src/app/[locale]/poster/[slug]/page.tsx",
  ])("%s gives every <main> the skip-link target", (file) => {
    const src = read(file);
    const mains = src.match(/<main\b/g) ?? [];

    expect(mains.length).toBeGreaterThan(0);
    expect(src.match(/<main\s+id=\{MAIN_CONTENT_ID\}/g) ?? []).toHaveLength(mains.length);
  });

  it("no public page opens a second <main> inside the layout's", () => {
    const dir = path.join(process.cwd(), "src/app/[locale]/(public)");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && p !== path.join(dir, "layout.tsx") && /<main\b/.test(fs.readFileSync(p, "utf8"))) {
          offenders.push(path.relative(dir, p));
        }
      }
    };
    walk(dir);

    expect(offenders).toEqual([]);
  });

  it.each([
    "src/app/[locale]/(public)/layout.tsx",
    "src/app/[locale]/(auth)/layout.tsx",
    "src/app/[locale]/(onboarding)/layout.tsx",
  ])("%s shows the floating Accessibility button", (file) => {
    expect(read(file)).toMatch(/<AccessibilityPanel\b/);
  });

  it("dashboards open the same panel from the account menu, without the floating button", () => {
    expect(read("src/components/shared/DashboardShell/index.tsx")).toMatch(/<AccessibilityPanel\b[^>]*showLauncher=\{false\}/);
    expect(read("src/components/shared/UserProfileDropdown.tsx")).toMatch(/openAccessibilityPanel\(\)/);
  });
});
