"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageNotifications, useMarkAllRead, useMarkOneRead } from "@/hooks/useNotifications";

export default function NotificationsPage() {
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
          title={`Notifications ${unreadCount > 0 ? `(${unreadCount})` : ""}`}
          description="Stay up to date with your applications, interviews and alerts"
        />
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllReadMutation.mutate()}
            className="flex items-center gap-1.5 text-xs text-primary hover:bg-primary/10 font-medium">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "unread"] as const).map((t) => (
          <Button key={t} variant="ghost" size="sm" onClick={() => setFilter(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              filter === t ? "bg-primary text-white hover:bg-primary/90" : "bg-muted/40 hover:bg-muted/60"
            }`}>{t}</Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="card-base text-center py-16">
          <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No {filter === "unread" ? "unread " : ""}notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
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
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(n.createdAt).toLocaleDateString("en-AE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
