/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Sidebar } from "@/components/shared/Sidebar";
import { getNavGroups } from "@/lib/nav/menuConfig";

let pathnameMock = "/en/super-agent";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock,
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        role: "super_agent",
      },
    },
    status: "authenticated",
  }),
}));

describe("Sidebar", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    pathnameMock = "/en/super-agent";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ count: 4 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the super-agent workspace with inline children for active child routes", async () => {
    pathnameMock = "/en/super-agent/approvals";

    const { container } = render(
      <Sidebar
        navGroups={getNavGroups("super_agent", "en")}
        locale="en"
        userRole="super_agent"
      />
    );

    expect(screen.getByText("Super agent workspace")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /approvals/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /placements/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument();
    });

    const workspaceSurface = container.querySelector("aside > div");
    expect(workspaceSurface).toHaveClass("border-r", "border-border/80");
    expect(workspaceSurface?.className).not.toContain("bg-slate-900");
    expect(screen.getByText("Super agent workspace")).toHaveClass("text-primary/75");
  });

  it("expands team children inside the primary sidebar", async () => {
    render(
      <Sidebar
        navGroups={getNavGroups("super_agent", "en")}
        locale="en"
        userRole="super_agent"
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/super-agent/approvals/count");
    });

    fireEvent.click(screen.getByRole("button", { name: /team/i }));

    expect(screen.getByRole("link", { name: /agents/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /leads/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /employers/i })).toBeInTheDocument();
  });

  it("renders the agent workspace with inline children for active child routes", async () => {
    pathnameMock = "/en/agent/candidates";

    const { container } = render(
      <Sidebar
        navGroups={getNavGroups("agent", "en")}
        locale="en"
        userRole="agent"
      />
    );

    expect(screen.getByText("Agent workspace")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hiring" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /candidates/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /jobs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /placements/i })).toBeInTheDocument();

    const workspaceSurface = container.querySelector("aside > div");
    expect(workspaceSurface).toHaveAttribute("data-sidebar-tone", "theme-aware");
    expect(workspaceSurface).toHaveClass("border-r", "border-border/80");
    expect(screen.getByText("Agent workspace")).toHaveClass("text-primary/75");
  });

  it("keeps the employer workspace on the theme-aware modern sidebar tone", async () => {
    pathnameMock = "/en/employer/jobs";

    const { container } = render(
      <Sidebar
        navGroups={getNavGroups("employer", "en")}
        locale="en"
        userRole="employer"
      />
    );

    expect(screen.getByText("Employer workspace")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^jobs$/i })).toBeInTheDocument();
    });

    const workspaceSurface = container.querySelector("aside > div");
    expect(workspaceSurface).toHaveAttribute("data-sidebar-tone", "theme-aware");
    expect(workspaceSurface).toHaveClass("border-r", "border-border/80");
    expect(screen.getByText("Employer workspace")).toHaveClass("text-primary/75");
  });

  it("expands tools children inside the primary sidebar for agent workspace", async () => {
    render(
      <Sidebar
        navGroups={getNavGroups("agent", "en")}
        locale="en"
        userRole="agent"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /tools/i }));

    expect(screen.getByRole("link", { name: /employers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /leads/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /commissions/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reports/i })).toBeInTheDocument();
  });

  it("toggles the active agent tools submenu open and closed", async () => {
    pathnameMock = "/en/agent/leads";

    render(
      <Sidebar
        navGroups={getNavGroups("agent", "en")}
        locale="en"
        userRole="agent"
      />
    );

    const toolsButton = screen.getByRole("button", { name: /tools/i });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /employers/i })).toBeInTheDocument();
    });

    fireEvent.click(toolsButton);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /employers/i })).not.toBeInTheDocument();
    });

    fireEvent.click(toolsButton);

    expect(screen.getByRole("link", { name: /employers/i })).toBeInTheDocument();
    expect(toolsButton).toHaveAttribute("aria-expanded", "true");
  });

  it("activates the tools group for nested lead routes", async () => {
    pathnameMock = "/en/agent/leads/new";

    render(
      <Sidebar
        navGroups={getNavGroups("agent", "en")}
        locale="en"
        userRole="agent"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /leads/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /tools/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the admin workspace with inline children for active child routes", async () => {
    pathnameMock = "/en/admin/jobs";

    const { container } = render(
      <Sidebar
        navGroups={getNavGroups("admin", "en")}
        locale="en"
        userRole="admin"
      />
    );

    expect(screen.getByText("Admin workspace")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recruitment" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^jobs$/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /applications/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /interviews/i })).toBeInTheDocument();

    const workspaceSurface = container.querySelector("aside > div");
    expect(workspaceSurface).toHaveAttribute("data-sidebar-tone", "theme-aware");
    expect(workspaceSurface).toHaveClass("border-r", "border-border/80");
    expect(workspaceSurface?.className).not.toContain("bg-slate-900");
    expect(screen.getByText("Admin workspace")).toHaveClass("text-primary/75");
  });

  it("removes the default sticky focus outline from CMS submenu navigation", async () => {
    pathnameMock = "/en/admin/cms/blogs";

    render(
      <Sidebar
        navGroups={getNavGroups("admin", "en")}
        locale="en"
        userRole="admin"
      />
    );

    const cmsButton = screen.getByRole("button", { name: /cms \/ landing page/i });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /blog posts/i })).toBeInTheDocument();
    });

    const blogLink = screen.getByRole("link", { name: /blog posts/i });

    expect(cmsButton.className).toContain("focus:outline-none");
    expect(cmsButton.className).toContain("focus-visible:ring-2");
    expect(blogLink.className).toContain("focus:outline-none");
    expect(blogLink.className).toContain("focus-visible:ring-2");
  });

  it("marks only the deepest matching CMS submenu item as active", async () => {
    pathnameMock = "/en/admin/cms/banners";

    render(
      <Sidebar
        navGroups={getNavGroups("admin", "en")}
        locale="en"
        userRole="admin"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /cms overview/i })).toBeInTheDocument();
    });

    const overviewLink = screen.getByRole("link", { name: /cms overview/i });
    const bannersLink = screen.getByRole("link", { name: /banners/i });

    expect(overviewLink.className).not.toContain("bg-card/92");
    expect(overviewLink.className).not.toContain("text-foreground font-semibold");
    expect(bannersLink.className).toContain("bg-card/92");
    expect(bannersLink.className).toContain("text-foreground font-semibold");
  });
});