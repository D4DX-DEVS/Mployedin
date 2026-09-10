/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { JobSeekerTopNav, JobSeekerBottomNav, splitSeekerNav } from "@/components/shared/JobSeekerTopNav";
import { getNavGroups, getAllNavItems } from "@/lib/nav/menuConfig";
import {
  APPLICATION_JOURNEY_PATHS,
  PROFILE_SECTION_PATHS,
} from "@/components/features/job-seeker/JobSeekerSectionNav";

let currentPath = "/en/job-seeker";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, layoutId: _layoutId, animate: _a, initial: _i, transition: _t, ...props }: React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>) => <span {...props}>{children}</span>,
  },
}));

describe("splitSeekerNav", () => {
  it("promotes the six job-board tabs", () => {
    const groups = getNavGroups("job_seeker", "en");
    const { primary } = splitSeekerNav(groups, "en");

    expect(primary.map((i) => i.href)).toEqual([
      "/en/job-seeker",
      "/en/job-seeker/jobs",
      "/en/job-seeker/applications",
      "/en/job-seeker/messages",
      "/en/job-seeker/companies",
      "/en/job-seeker/saved-searches",
    ]);
  });

  it("keeps Profile out of the tabs — the header avatar already opens it", () => {
    const groups = getNavGroups("job_seeker", "en");
    const { primary, rest } = splitSeekerNav(groups, "en");
    const shown = [...primary, ...rest.flatMap((g) => g.items)].map((i) => i.href);

    expect(shown).not.toContain("/en/job-seeker/profile");
    expect(shown).not.toContain("/en/job-seeker/settings");
  });

  it("leaves nothing for More to hold on desktop", () => {
    const groups = getNavGroups("job_seeker", "en");
    const { rest } = splitSeekerNav(groups, "en");

    expect(rest.flatMap((g) => g.items)).toEqual([]);
  });

  /**
   * The menu shrank; the destinations did not. Anything dropped from More has
   * to be reachable from the hub page that owns it, or it is orphaned.
   */
  it("gives every remaining config entry a hub page to live on", () => {
    const groups = getNavGroups("job_seeker", "en");
    const { primary, rest } = splitSeekerNav(groups, "en");
    const shown = new Set([
      ...primary.map((i) => i.href),
      ...rest.flatMap((g) => g.items.map((i) => i.href)),
    ]);
    const hubbed = new Set(
      [
        ...APPLICATION_JOURNEY_PATHS,
        ...PROFILE_SECTION_PATHS,
        // Reached from the header avatar menu rather than from a hub page.
        "/job-seeker/subscription",
        "/job-seeker/settings",
      ].map((p) => `/en${p}`)
    );

    const unreachable = getAllNavItems("job_seeker", "en")
      .map((i) => i.href)
      .filter((href) => !shown.has(href) && !hubbed.has(href));

    expect(unreachable).toEqual([]);
  });
});

describe("JobSeekerTopNav", () => {
  it("renders Arabic labels from menuConfig", () => {
    currentPath = "/ar/job-seeker";
    render(<JobSeekerTopNav locale="ar" navGroups={getNavGroups("job_seeker", "ar")} />);

    expect(screen.getByText("الرئيسية")).toBeInTheDocument();
    expect(screen.getByText("الوظائف")).toBeInTheDocument();
    expect(screen.getByText("طلباتي")).toBeInTheDocument();
    expect(screen.getByText("الرسائل")).toBeInTheDocument();
    expect(screen.getByText("الشركات")).toBeInTheDocument();
    expect(screen.getByText("عمليات البحث المحفوظة")).toBeInTheDocument();
    // Profile is on the avatar menu, not in the tabs.
    expect(screen.queryByText("الملف الشخصي")).not.toBeInTheDocument();
  });

  it("marks the active tab and paints live counts on the tab that owns them", () => {
    currentPath = "/en/job-seeker/applications/abc";
    render(
      <JobSeekerTopNav
        locale="en"
        navGroups={getNavGroups("job_seeker", "en")}
        counts={{ unreadMessages: 3, pendingOffers: 12 }}
      />
    );

    expect(screen.getByText("Applications").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Home").closest("a")).not.toHaveAttribute("aria-current");
    // Messages is a primary tab → its own badge.
    expect(screen.getByText("Messages").closest("a")).toHaveTextContent("3");
    // No "More" trigger left to roll counts up onto.
    expect(screen.queryByText("more")).not.toBeInTheDocument();
  });

  it("drops the duplicated account entries the avatar menu owns", () => {
    currentPath = "/en/job-seeker";
    render(<JobSeekerTopNav locale="en" navGroups={getNavGroups("job_seeker", "en")} />);

    const nav = screen.getByRole("navigation", { name: "jobSeekerNavigation" });
    expect(nav).not.toHaveTextContent("Profile");
    expect(nav).not.toHaveTextContent("Settings");
    expect(nav).toHaveTextContent("Companies");
    expect(nav).toHaveTextContent("Saved Searches");
  });
});

describe("JobSeekerBottomNav", () => {
  it("fills the tab bar with finding work, not with the account", () => {
    currentPath = "/en/job-seeker/jobs";
    render(<JobSeekerBottomNav locale="en" navGroups={getNavGroups("job_seeker", "en")} />);

    const bar = screen.getByRole("navigation", { name: "jobSeekerMobileNavigation" });
    expect(bar).toHaveTextContent("Home");
    expect(bar).toHaveTextContent("Jobs");
    expect(bar).toHaveTextContent("Applications");
    // Messages sits in the sheet, Profile on the header avatar.
    expect(bar).not.toHaveTextContent("Messages");
    expect(bar).not.toHaveTextContent("Profile");
  });

  it("keeps everything the tab bar gave up reachable from the sheet", () => {
    currentPath = "/en/job-seeker/settings";
    render(<JobSeekerBottomNav locale="en" navGroups={getNavGroups("job_seeker", "en")} />);

    fireEvent.click(screen.getByRole("button", { name: /more/ }));
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("Messages");
    expect(sheet).toHaveTextContent("Companies");
    expect(sheet).toHaveTextContent("Saved Searches");
    // Offers moved to the Applications hub; Profile, Settings and Subscription
    // to the header avatar menu. None of them belong in this sheet.
    expect(sheet).not.toHaveTextContent("Offers");
    expect(sheet).not.toHaveTextContent("My Subscription");
    expect(sheet).not.toHaveTextContent("Settings");
  });
});
