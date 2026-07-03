"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageNotifications, useMarkAllRead, useMarkOneRead } from "@/hooks/useNotifications";
import { EnablePushButton } from "@/components/shared/EnablePushButton";
import { resolveNotificationText } from "@/lib/notifications/resolve";

export default function NotificationsPage() {
  const t = useTranslations("notificationsPage");
  const tc = useTranslations("notificationContent");
  const locale = useLocale();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data: notifications = [], isLoading: loading } = usePageNotifications(filter);
  const markAllReadMutation = useMarkAllRead();
  const markOneReadMutation = useMarkOneRead();

  const typeIcon = (type: string) => {
    const colors: Record<string, string> = {
      application_received: "bg-blue-50 text-blue-600",
      interview_scheduled: "bg-purple-50 text-purple-600",
      status_update: "bg-green-50 text-green-600",
      system: "bg-muted/30 text-muted-foreground",
    };
    return colors[type] ?? "bg-muted text-muted-foreground";
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`${t("title")} ${unreadCount > 0 ? `(${unreadCount})` : ""}`}
          description={t("description")}
        />
        <div className="flex items-center gap-2">
          <EnablePushButton />
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllReadMutation.mutate()}
              className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/10 font-medium">
              <CheckCheck className="h-3.5 w-3.5" /> {t("markAllRead")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {(["all", "unread"] as const).map((tab) => (
          <Button key={tab} variant="ghost" size="sm" onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === tab ? "bg-primary text-white hover:bg-primary/90" : "bg-muted/40 hover:bg-muted/60"
            }`}>{tab === "all" ? t("filterAll") : t("filterUnread")}</Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-4 rounded-xl border border-border animate-pulse"
              style={{ opacity: 1 - i * 0.12 }}>
              <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2 py-0.5">
                <div className="h-4 w-2/5 rounded bg-muted" />
                <div className="h-3 w-4/5 rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card-base text-center py-16">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{filter === "unread" ? t("emptyUnread") : t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const { title, body } = resolveNotificationText(n, tc, locale);
            return (
            <div
              key={n._id}
              onClick={() => { if (!n.isRead) markOneReadMutation.mutate(n._id); if (n.actionUrl) window.location.href = n.actionUrl; }}
              className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
                n.isRead ? "opacity-70 bg-background" : "bg-primary/5 border-primary/20"
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${typeIcon(n.type ?? "system")}`}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-AE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
