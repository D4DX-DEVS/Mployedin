"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnreadMessageCount } from "@/hooks/useConversations";
import type { NavGroup, NavItem } from "@/lib/nav/menuConfig";

interface MessagesIndicatorProps {
  navGroups: NavGroup[];
  /** Workspace root, e.g. "/en/employer" — already locale-prefixed. */
  rootHref: string;
}

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

/**
 * Whether a role's sidebar already lists its inbox. The shell needs the same
 * answer this component does: when the topbar owns Messages, the unread count
 * belongs on the topbar icon and must not also be painted on the phone's
 * "More" tab, which opens a drawer with no inbox in it.
 */
export function navHasMessagesEntry(navGroups: NavGroup[], rootHref: string): boolean {
  const messagesHref = `${rootHref}/messages`;
  return flatten(navGroups.flatMap((group) => group.items)).some(
    (item) => item.href === messagesHref
  );
}

/**
 * Messages beside the bell, with an unread count.
 *
 * The employer sidebar dropped its Messages row when the nav collapsed, so the
 * inbox needs a home on desktop. It renders only for a workspace whose nav has
 * no messages entry of its own — a role that still lists Messages in the
 * sidebar would otherwise show the same destination twice.
 */
export function MessagesIndicator({ navGroups, rootHref }: MessagesIndicatorProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const unread = useUnreadMessageCount();

  const messagesHref = `${rootHref}/messages`;
  if (navHasMessagesEntry(navGroups, rootHref)) return null;

  const active = pathname === messagesHref || pathname.startsWith(`${messagesHref}/`);

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative h-11 w-11"
      aria-label={t("messages")}
    >
      <Link href={messagesHref} aria-current={active ? "page" : undefined}>
        <MessageSquare className={`h-4 w-4 ${active || unread > 0 ? "text-brand-blue" : ""}`} />
        {unread > 0 && (
          <span className="pointer-events-none absolute top-1.5 end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
