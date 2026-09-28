"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bell,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Filter,
  MessageCircle,
  Settings2,
  Target,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBellNotifications, useMarkAllRead, useMarkOneRead, type NotificationItem } from "@/hooks/useNotifications";
import { resolveNotificationText, localizeActionUrl } from "@/lib/notifications/resolve";
import { notificationSettingsPath } from "@/lib/communications/unsubscribeLink";
import { UserAvatar } from "@/components/shared/UserAvatar";

interface NotificationBellProps {
  locale: string;
  userRole?: string;
}

type NotificationTab = "all" | "inbox" | "following" | "archived";

const visualByType: Record<string, { Icon: LucideIcon; className: string }> = {
  application_received: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  application_update: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  application_status_update: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  application_invite: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  job_posted: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  job_approved: { Icon: BriefcaseBusiness, className: "bg-emerald-50 text-emerald-600" },
  job_rejected: { Icon: FileText, className: "bg-rose-50 text-rose-600" },
  interview_scheduled: { Icon: CalendarClock, className: "bg-violet-50 text-violet-600" },
  interview_reminder: { Icon: CalendarClock, className: "bg-violet-50 text-violet-600" },
  interview_update: { Icon: CalendarClock, className: "bg-violet-50 text-violet-600" },
  offer_update: { Icon: FileText, className: "bg-emerald-50 text-emerald-600" },
  placement: { Icon: Check, className: "bg-emerald-50 text-emerald-600" },
  placement_completed: { Icon: Check, className: "bg-emerald-50 text-emerald-600" },
  lead_converted: { Icon: Check, className: "bg-emerald-50 text-emerald-600" },
  payment: { Icon: CircleDollarSign, className: "bg-amber-50 text-amber-600" },
  target_assigned: { Icon: Target, className: "bg-amber-50 text-amber-600" },
  target_updated: { Icon: Target, className: "bg-amber-50 text-amber-600" },
  target_at_risk: { Icon: Target, className: "bg-rose-50 text-rose-600" },
  target_milestone: { Icon: Target, className: "bg-emerald-50 text-emerald-600" },
  mention: { Icon: MessageCircle, className: "bg-fuchsia-50 text-fuchsia-600" },
  message: { Icon: MessageCircle, className: "bg-fuchsia-50 text-fuchsia-600" },
  agent_joined: { Icon: UserPlus, className: "bg-sky-50 text-sky-600" },
  employer_registered: { Icon: UserPlus, className: "bg-sky-50 text-sky-600" },
  job_seeker_registered: { Icon: UserPlus, className: "bg-sky-50 text-sky-600" },
  new_job_posted: { Icon: BriefcaseBusiness, className: "bg-sky-50 text-sky-600" },
  profile_update: { Icon: UserPlus, className: "bg-sky-50 text-sky-600" },
  verification: { Icon: Check, className: "bg-emerald-50 text-emerald-600" },
  exhibition_request: { Icon: CalendarClock, className: "bg-violet-50 text-violet-600" },
  system: { Icon: Settings2, className: "bg-muted text-muted-foreground" },
};

function notificationVisual(type?: string) {
  return visualByType[type ?? ""] ?? { Icon: BellRing, className: "bg-primary/10 text-primary" };
}

function isMetaFlag(value: unknown): boolean {
  return value === true;
}

function formatNotificationTime(date: Date, locale: string): string {
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  const relativeLocale = locale === "ar" ? "ar" : "en";
  const formatter = new Intl.RelativeTimeFormat(relativeLocale, { numeric: "always", style: "short" });
  if (diffMinutes < 1) return locale === "ar" ? "الآن" : "just now";
  if (diffMinutes < 60) return formatter.format(-diffMinutes, "minute");
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return formatter.format(-days, "day");
  return new Intl.DateTimeFormat(relativeLocale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function tabItems(
  notifications: NotificationItem[],
  tab: NotificationTab,
) {
  // This helper keeps the four reference tabs useful without changing the
  // notification schema: following/archived can be added as metadata by any
  // producer, while legacy rows remain in All and Inbox.
  return notifications.filter((notification) => {
    const meta = notification.meta ?? {};
    if (tab === "archived") return isMetaFlag(meta.archived);
    if (tab === "following") return isMetaFlag(meta.following);
    if (tab === "inbox") return !notification.isRead && !isMetaFlag(meta.archived);
    return true;
  });
}

export function NotificationBell({ locale, userRole }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const t = useTranslations("notificationsPage");
  const tc = useTranslations("notificationContent");
  const { data } = useBellNotifications(locale);
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const markAllRead = useMarkAllRead();
  const markOneRead = useMarkOneRead();
  const visibleNotifications = tabItems(notifications, tab);
  const settingsHref = notificationSettingsPath(userRole, locale);
  const unreadInInbox = notifications.filter((notification) => !notification.isRead && !isMetaFlag(notification.meta?.archived)).length;

  // Closing the panel used to clear every unread notification, including ones
  // the reader never scrolled to. Opening a list is not reading it: a row marks
  // itself read when it is clicked, and "Mark all read" stays the explicit way
  // to clear the rest.
  function handleOpenChange(next: boolean) {
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-xl bg-muted/30" aria-label={t("title")}>
          <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(25rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border-border/80 bg-background p-0 shadow-xl shadow-foreground/10">
        <div className="flex h-14 items-center justify-between border-b border-border/70 px-4">
          <h4 className="text-sm font-semibold tracking-tight">{t("title")}</h4>
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("markAllRead")}
            </button>
          )}
        </div>
        <div role="tablist" aria-label={t("filterLabel")} className="flex h-11 items-center gap-1 border-b border-border/70 px-2">
          {(["all", "inbox", "following", "archived"] as const).map((item) => {
            const isActive = tab === item;
            const label = item === "all" ? t("filterAll") : item === "inbox" ? t("filterInbox") : item === "following" ? t("filterFollowing") : t("filterArchived");
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(item)}
                className={`relative inline-flex h-full items-center gap-1.5 px-2.5 text-xs font-medium transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                {item === "inbox" && unreadInInbox > 0 && (
                  <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">{unreadInInbox}</span>
                )}
                {isActive && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
          <Link href={`/${locale}/notifications`} onClick={() => setOpen(false)} className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={t("filterLabel")}>
            <Filter className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="max-h-[25rem] overflow-y-auto">
          {visibleNotifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {tab === "inbox" ? t("emptyUnread") : tab === "following" ? t("emptyFollowing") : tab === "archived" ? t("emptyArchived") : t("empty")}
            </div>
          ) : (
            visibleNotifications.map((n) => {
              const { title, body } = resolveNotificationText(n, tc, locale);
              const href = localizeActionUrl(n.actionUrl, locale);
              const { className: iconClassName } = notificationVisual(n.type);
              const source = typeof n.meta?.source === "string" ? n.meta.source : t("typeActivity");
              const actorName = [n.meta?.actorName, n.meta?.userName, n.meta?.name]
                .find((value): value is string => typeof value === "string" && value.trim().length > 0)
                ?? title;
              const actorEmail = typeof n.meta?.actorEmail === "string" ? n.meta.actorEmail : undefined;
              const actorAvatar = [n.meta?.actorAvatar, n.meta?.avatar, n.meta?.userAvatar]
                .find((value): value is string => typeof value === "string" && value.trim().length > 0);
              const rowClass = `group relative flex gap-3 border-b border-border/60 px-4 py-3.5 text-start transition-colors last:border-0 ${!n.isRead ? "bg-primary/[0.025]" : ""}`;
              const content = (
                <>
                  <span className="relative mt-0.5 block h-9 w-9 shrink-0">
                    <UserAvatar
                      name={actorName}
                      email={actorEmail}
                      src={actorAvatar}
                      className="h-9 w-9"
                      fallbackClassName={iconClassName}
                    />
                    {!n.isRead && <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${!n.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                      {title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">{body}</span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{formatNotificationTime(new Date(n.createdAt), locale)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{source}</span>
                    </span>
                  </span>
                </>
              );

              if (href) {
                return (
                  <Link
                    key={n._id}
                    href={href}
                    aria-label={`${title}. ${body}`}
                    onClick={() => {
                      if (!n.isRead) markOneRead.mutate(n._id);
                      setOpen(false);
                    }}
                    className={`${rowClass} hover:bg-muted/40`}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => !n.isRead && markOneRead.mutate(n._id)}
                  aria-label={!n.isRead ? t("markAsRead", { title }) : `${title}. ${body}`}
                  className={`w-full ${rowClass} ${!n.isRead ? "cursor-pointer hover:bg-muted/40" : "text-start"}`}
                >
                  {content}
                </button>
              );
            })
          )}
        </div>
        <Link
          href={`/${locale}/notifications`}
          onClick={() => setOpen(false)}
          className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors hover:bg-muted/40"
        >
          {t("viewAll")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {t("useToNavigate")}
            <kbd className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono">↵</kbd>
          </span>
          <Link href={settingsHref} onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary">
            <Settings2 className="h-3.5 w-3.5" />
            {t("manageNotifications")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
