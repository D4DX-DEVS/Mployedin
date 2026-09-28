import type { IconName } from "./iconRegistry";
import type { NavGroup, NavItem } from "./menuConfig";

/**
 * Icon of the most specific nav entry that owns `pathname`.
 *
 * Page headers used to fall back to a generic Sparkles glyph whenever a page
 * did not pass `icon` — ~130 of them did not — so most headers showed the same
 * placeholder while the sidebar beside them already had a real icon for the
 * route. The header now borrows that icon (see `PageNavIcon`).
 *
 * Longest href wins; on a tie the child wins over its parent (admin "People"
 * and its "Employers" child share `/admin/employers`). Workspace roots
 * (`/en/admin`) match exactly only — as a prefix they would own every page.
 */
export function resolvePageNavIcon(navGroups: readonly NavGroup[], pathname: string): IconName | null {
  // Parents before their children, so the tie rule below favours the child.
  const flatten = (items: readonly NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
  let best: IconName | null = null;
  let bestLength = -1;
  for (const item of navGroups.flatMap((group) => flatten(group.items))) {
    const href = item.href.split(/[?#]/)[0];
    const isRoot = href.split("/").filter(Boolean).length <= 2;
    const owns = pathname === href || (!isRoot && pathname.startsWith(`${href}/`));
    if (owns && href.length >= bestLength) {
      best = item.icon;
      bestLength = href.length;
    }
  }
  return best;
}
