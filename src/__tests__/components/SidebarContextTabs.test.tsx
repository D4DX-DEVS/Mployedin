/**
 * @jest-environment jsdom
 */
/**
 * Admin Settings used to list the same eleven children twice: in the rail
 * flyout and again in the tab strip the shell draws for `contextTabs` sections.
 * On admin a tabbed section is now a plain link to its first tab, and the tabs
 * are its only child navigation. Every other flyout, and employer Settings
 * (the frozen reference), keeps the old behaviour.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Sidebar } from "@/components/shared/Sidebar";
import { getNavGroups } from "@/lib/nav/menuConfig";

let pathnameMock = "/en/admin";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock,
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated" }),
}));

// One stable function: a fresh t per render re-fires effects that list it.
const t = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => t,
}));

const zeroCounts = new Proxy({}, { get: () => 0 });
jest.mock("@/hooks/useConversations", () => ({ useUnreadMessageCount: () => 0 }));
jest.mock("@/hooks/useAdminActionCounts", () => ({ useAdminActionCounts: () => zeroCounts }));
jest.mock("@/hooks/useJobSeekerActionCounts", () => ({ useJobSeekerActionCounts: () => zeroCounts }));
jest.mock("@/hooks/useSuperAgentActionCounts", () => ({ useSuperAgentActionCounts: () => zeroCounts }));
jest.mock("@/hooks/useAgentActionCounts", () => ({ useAgentActionCounts: () => zeroCounts }));

function renderRail(role: "admin" | "employer", pathname: string) {
  pathnameMock = pathname;
  const view = render(<Sidebar navGroups={getNavGroups(role, "en")} locale="en" userRole={role} />);
  const rail = view.container.querySelector(".dashboard-sidebar-primary") as HTMLElement;
  return { ...view, rail: within(rail) };
}

describe("admin sections with a tab strip", () => {
  it("link Settings and System straight to their first tab", () => {
    const { rail } = renderRail("admin", "/en/admin");

    const settings = rail.getByRole("link", { name: "Settings" });
    const system = rail.getByRole("link", { name: "System" });

    expect(settings).toHaveAttribute("href", "/en/admin/settings");
    expect(system).toHaveAttribute("href", "/en/admin/audit-logs");
    expect(settings).not.toHaveAttribute("aria-expanded");
    expect(rail.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(rail.queryByRole("button", { name: "System" })).not.toBeInTheDocument();
  });

  it("open no flyout that would repeat the tabs", () => {
    const { container, rail } = renderRail("admin", "/en/admin/webhooks");

    fireEvent.click(rail.getByRole("link", { name: "Settings" }));

    expect(container.querySelector(".dashboard-sidebar-secondary nav")).toBeNull();
    expect(screen.queryByRole("link", { name: "Webhooks" })).not.toBeInTheDocument();
  });

  it("highlight the section while any of its tabs is open", () => {
    const { rail } = renderRail("admin", "/en/admin/communications");

    expect(rail.getByRole("link", { name: "System" })).toHaveAttribute("aria-current", "page");
    expect(rail.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
  });

  it("leave other admin sections on their flyout", () => {
    const { container, rail } = renderRail("admin", "/en/admin");

    const cms = rail.getByRole("button", { name: "CMS / Content" });
    fireEvent.click(cms);

    expect(cms).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".dashboard-sidebar-secondary nav")).not.toBeNull();
  });
});

describe("employer Settings (frozen reference)", () => {
  it("keeps its flyout", () => {
    const { rail } = renderRail("employer", "/en/employer");

    const settings = rail.getByRole("button", { name: "Settings" });
    fireEvent.click(settings);

    expect(settings).toHaveAttribute("aria-expanded", "true");
  });
});
