import { render } from "@testing-library/react";
import { getNavGroups, type NavGroup } from "@/lib/nav/menuConfig";
import { PageNavIcon, PageNavIconProvider } from "@/components/shared/PageNavIcon";
import { resolvePageNavIcon } from "@/lib/nav/pageNavIcon";

describe("resolvePageNavIcon", () => {
  const admin = getNavGroups("admin", "en");

  it("uses the child's icon when a parent shares its href", () => {
    // "People" (Users) and its "Employers" child (Building2) both link /admin/employers.
    expect(resolvePageNavIcon(admin, "/en/admin/employers")).toBe("Building2");
  });

  it("owns detail routes under a nav entry", () => {
    expect(resolvePageNavIcon(admin, "/en/admin/employers/abc123")).toBe("Building2");
  });

  it("matches the workspace root exactly, never as a prefix", () => {
    expect(resolvePageNavIcon(admin, "/en/admin")).toBe("LayoutDashboard");
    expect(resolvePageNavIcon(admin, "/en/admin/no-such-page")).toBeNull();
  });

  it("prefers the longest matching href and ignores query strings", () => {
    const groups: NavGroup[] = [
      {
        items: [
          { title: "Jobs", titleAr: "", href: "/en/x/jobs?status=open", icon: "Briefcase" },
          { title: "New", titleAr: "", href: "/en/x/jobs/new", icon: "Plus" },
        ],
      },
    ];
    expect(resolvePageNavIcon(groups, "/en/x/jobs")).toBe("Briefcase");
    expect(resolvePageNavIcon(groups, "/en/x/jobs/new")).toBe("Plus");
  });
});

describe("PageNavIcon", () => {
  it("renders the provided nav icon", () => {
    const { container } = render(
      <PageNavIconProvider icon="Building2">
        <PageNavIcon />
      </PageNavIconProvider>
    );
    expect(container.querySelector("svg.lucide-building2, svg.lucide-building-2")).not.toBeNull();
  });

  it("falls back to Sparkles outside a workspace shell", () => {
    const { container } = render(<PageNavIcon />);
    expect(container.querySelector("svg.lucide-sparkles")).not.toBeNull();
  });
});
