"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bell, CheckCheck, Loader2, X } from "lucide-react";

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?unreadOnly=${filter === "unread"}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, isRead: true } : n));
  };

  const typeIcon = (type: string) => {
    const colors: Record<string, string> = {
      application_received: "bg-blue-50 text-blue-600",
      interview_scheduled: "bg-purple-50 text-purple-600",
      status_update: "bg-green-50 text-green-600",
      system: "bg-gray-50 text-gray-600",
    };
    return colors[type] ?? "bg-muted text-muted-foreground";
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="p-6 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Notifications ${unreadCount > 0 ? `(${unreadCount})` : ""}`}
          description="Stay up to date with your applications, interviews and alerts"
        />
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 font-medium">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "unread"] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              filter === t ? "bg-primary text-white" : "bg-muted/40 hover:bg-muted/60"
            }`}>{t}</button>
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
              onClick={() => { if (!n.isRead) markRead(n._id); if (n.link) window.location.href = n.link; }}
              className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${
                n.isRead ? "opacity-70 bg-background" : "bg-primary/5 border-primary/20"
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${typeIcon(n.type)}`}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
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
