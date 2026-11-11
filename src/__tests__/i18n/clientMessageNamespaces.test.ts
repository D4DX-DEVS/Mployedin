/**
 * @jest-environment node
 */
/**
 * Each route group hands its client components only the message namespaces
 * they use (PERF-01: the whole catalogue made the public home page ~790 KB).
 * next-intl can only resolve what the nearest provider was given, so a
 * namespace used in a group but missing from its list would break every string
 * under it. This walks each group's import graph and checks the lists.
 */
import path from "node:path";
import { CLIENT_NAMESPACES, pickMessages, type ClientMessageGroup } from "@/lib/i18n/clientMessages";
import { routeEntries, scanNamespaces } from "@/__tests__/helpers/translationNamespaces";

const L = path.join(process.cwd(), "src/app/[locale]");
const GROUP_ENTRIES: Record<ClientMessageGroup, string[]> = {
  root: [path.join(L, "layout.tsx")],
  public: routeEntries(path.join(L, "(public)")),
  auth: routeEntries(path.join(L, "(auth)")),
  onboarding: routeEntries(path.join(L, "(onboarding)")),
  poster: routeEntries(path.join(L, "poster")),
};
const en = require(path.join(process.cwd(), "messages/en.json")) as Record<string, unknown>;

describe.each(Object.keys(GROUP_ENTRIES) as ClientMessageGroup[])("%s group", (group) => {
  const scan = scanNamespaces(GROUP_ENTRIES[group]);

  it("lists every namespace its components use", () => {
    // Listed whole ("auth"), or as the sub-tree a component reads
    // ("cvBuilderPage.previewSections") or one above it.
    const listed = CLIENT_NAMESPACES[group] as readonly string[];
    const covered = (used: string) => listed.some((entry) => used === entry || used.startsWith(`${entry}.`));
    expect([...scan.paths].filter((used) => !covered(used)).sort()).toEqual([]);
  });

  it("uses no namespace a subset cannot cover (none, or a variable)", () => {
    expect(scan.unscannable).toEqual([]);
  });

  it("lists only namespaces that exist", () => {
    const exists = (entry: string) =>
      entry.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), en) !== undefined;
    expect((CLIENT_NAMESPACES[group] as readonly string[]).filter((entry) => !exists(entry))).toEqual([]);
  });
});

it("hands a group only the sub-tree it lists, not the namespace around it", () => {
  const picked = pickMessages(en as never, "public") as Record<string, Record<string, unknown>>;
  expect(Object.keys(picked.cvBuilderPage).sort()).toEqual(["previewSections", "proficiency"]);
  expect(picked.cvBuilderPage.previewSections).toEqual((en.cvBuilderPage as Record<string, unknown>).previewSections);
  expect(picked.easyApply).toBe(en.easyApply);
});

it("the maintenance page reads no client messages (it relies on the root subset)", () => {
  const scan = scanNamespaces(routeEntries(path.join(L, "maintenance")));
  expect([...scan.namespaces].filter((ns) => !(CLIENT_NAMESPACES.root as readonly string[]).includes(ns))).toEqual([]);
});
