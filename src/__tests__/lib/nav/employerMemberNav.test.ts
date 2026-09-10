/**
 * @jest-environment node
 */
/**
 * The employer navigation contract for a company member.
 *
 * An employer who owns their company holds every granted function, so their
 * rail must be byte-identical to what it was before members existed. A
 * colleague sees only what they were granted, with no empty parent rows and no
 * parent linking into a page they cannot open.
 */
import { getNavGroups, type NavItem } from "@/lib/nav/menuConfig";
import { computeEffectivePermissions } from "@/models/CompanyUser";

const flatten = (items: NavItem[]): NavItem[] =>
  items.flatMap((i) => [i, ...flatten(i.children ?? [])]);

const items = (permissions?: Parameters<typeof getNavGroups>[2]) =>
  flatten(getNavGroups("employer", "en", permissions).flatMap((g) => g.items));

const hrefs = (permissions?: Parameters<typeof getNavGroups>[2]) =>
  items(permissions).map((i) => i.href);

describe("employer navigation for a company member", () => {
  it("is unchanged for an owner", () => {
    expect(hrefs(computeEffectivePermissions(["owner"]))).toEqual(hrefs(undefined));
  });

  it("includes a Team row", () => {
    expect(hrefs(undefined)).toContain("/en/employer/team");
  });

  it("hides the Team row from a member who cannot manage the team", () => {
    expect(hrefs(computeEffectivePermissions(["hiring_manager"]))).not.toContain(
      "/en/employer/team"
    );
  });

  it("keeps only the screening rows for a screening-only member", () => {
    const visible = hrefs(computeEffectivePermissions(["viewer"], { canRunScreening: true }));
    expect(visible).toContain("/en/employer/background-checks");
    expect(visible).toContain("/en/employer/screening-analytics");
    expect(visible).not.toContain("/en/employer/invoices");
    expect(visible).not.toContain("/en/employer/jobs");
    expect(visible).not.toContain("/en/employer/team");
  });

  it("always keeps Home, which carries no function tag", () => {
    expect(hrefs(computeEffectivePermissions(["viewer"]))).toContain("/en/employer");
  });

  it("drops a parent whose children were all filtered away", () => {
    const perms = computeEffectivePermissions(["viewer"], { canRunScreening: true });
    for (const item of items(perms)) {
      if (!item.children) continue;
      expect({ title: item.title, children: item.children.length }).not.toEqual({
        title: item.title,
        children: 0,
      });
    }
  });

  it("never leaves a parent linking to a child that was filtered away", () => {
    const perms = computeEffectivePermissions(["viewer"], { canRunScreening: true });
    const visible = new Set(hrefs(perms));
    for (const item of items(perms)) {
      if (!item.children) continue;
      expect({ title: item.title, reachable: visible.has(item.href) }).toEqual({
        title: item.title,
        reachable: true,
      });
    }
  });

  it("every tagged row names a real permission flag", () => {
    const ownerPerms = computeEffectivePermissions(["owner"]);
    const tagged = items(undefined).filter((i) => i.companyFunction);
    expect(tagged.length).toBeGreaterThan(0);
    for (const item of tagged) {
      expect({ href: item.href, known: item.companyFunction! in ownerPerms }).toEqual({
        href: item.href,
        known: true,
      });
    }
  });

  it("leaves the other roles' navigation untouched by a permission argument", () => {
    const perms = computeEffectivePermissions(["viewer"]);
    for (const role of ["admin", "agent", "super_agent", "job_seeker"] as const) {
      expect(getNavGroups(role, "en", perms)).toEqual(getNavGroups(role, "en"));
    }
  });
});
