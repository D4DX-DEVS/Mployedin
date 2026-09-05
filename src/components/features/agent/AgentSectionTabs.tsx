"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export interface AgentSectionTab {
  /** Path without the locale prefix, e.g. "/agent/target-report". */
  href: string;
  /** Key into the translation namespace passed as `namespace`. */
  labelKey: string;
}

interface AgentSectionTabsProps {
  tabs: readonly AgentSectionTab[];
  /** Accessible name for the tab strip; a key in `agentSections`. */
  ariaLabelKey: string;
}

/**
 * One destination, several pages.
 *
 * Four separate sidebar rows used to report on the same agent — Reports,
 * Targets, Target Report and Commission Report — and Messages and Team Chat
 * were two top-level inboxes. Collapsing each set into a single nav entry would
 * have stranded the other routes, so the sibling routes stay and this strip
 * carries the reader between them. The nav now names the section; the tabs name
 * the views inside it.
 */
export function AgentSectionTabs({ tabs, ariaLabelKey }: AgentSectionTabsProps) {
  // One namespace for every tab strip: the pages they sit on each use their own
  // namespace, and a tab label belongs to the section, not to the page.
  const t = useTranslations("agentSections");
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";

  return (
    <nav
      aria-label={t(ariaLabelKey)}
      // Scrolls rather than wraps: five tabs at phone width would otherwise
      // stack into a block taller than the panel they introduce.
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const href = `/${locale}${tab.href}`;
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold transition ${
              active
                ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/25"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

/** The four pages that report on an agent's performance. */
export const AGENT_PERFORMANCE_TABS: readonly AgentSectionTab[] = [
  { href: "/agent/reports", labelKey: "tabActivity" },
  { href: "/agent/target-management", labelKey: "tabTargets" },
  { href: "/agent/target-report", labelKey: "tabTargetReport" },
  { href: "/agent/commissions-report", labelKey: "tabCommissionReport" },
];

/** Direct messages and the team channels, previously two sidebar rows. */
export const AGENT_INBOX_TABS: readonly AgentSectionTab[] = [
  { href: "/agent/messages", labelKey: "tabDirect" },
  { href: "/agent/chat", labelKey: "tabChannels" },
];
