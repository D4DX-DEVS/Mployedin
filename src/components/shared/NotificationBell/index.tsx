"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatRelativeTime } from "@/lib/utils";
import { useBellNotifications, useMarkAllRead, useMarkOneRead } from "@/hooks/useNotifications";
import { resolveNotificationText, localizeActionUrl } from "@/lib/notifications/resolve";

interface NotificationBellProps {
  locale: string;
}

export function NotificationBell({ locale }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("notificationsPage");
  const tc = useTranslations("notificationContent");
  const { data } = useBellNotifications(locale);
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const markAllRead = useMarkAllRead();
  const markOneRead = useMarkOneRead();

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
        <Button variant="ghost" size="icon" className="relative h-11 w-11" aria-label={t("title")}>
          <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-brand-blue" : ""}`} />
          {unreadCount > 0 && (
            <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="text-sm font-semibold">{t("title")}</h4>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-xs text-brand-blue hover:underline"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            notifications.map((n) => {
              const { title, body } = resolveNotificationText(n, tc, locale);
              const href = localizeActionUrl(n.actionUrl, locale);
              // The row content is identical whether or not the notification
              // points somewhere; only the wrapper differs, so a notification
              // that can be acted on is a link and one that cannot is not
              // pretending to be.
              const content = (
                <>
                  {!n.isRead && (
                    <span className="absolute start-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  <p className={`text-sm font-medium ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {body}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(new Date(n.createdAt))}
                  </p>
                </>
              );
              const rowClass = `relative block px-4 py-3 border-b border-border last:border-0 transition-colors ${
                !n.isRead ? "bg-primary/5" : ""
              }`;

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
                <div
                  key={n._id}
                  onClick={() => !n.isRead && markOneRead.mutate(n._id)}
                  className={`${rowClass} ${!n.isRead ? "cursor-pointer hover:bg-muted/40" : ""}`}
                >
                  {content}
                </div>
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
      </PopoverContent>
    </Popover>
  );
}
