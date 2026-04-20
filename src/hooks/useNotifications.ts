import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface NotificationItem {
  _id: string;
  type?: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

export const notificationKeys = {
  all: ["notifications"] as const,
  bell: (locale: string) => [...notificationKeys.all, "bell", locale] as const,
  list: (filter: string) => [...notificationKeys.all, "list", filter] as const,
};

async function fetchBellNotifications(locale: string): Promise<NotificationsResponse> {
  const res = await fetch(`/api/notifications?limit=10&locale=${encodeURIComponent(locale)}`);
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const data = await res.json();
  return {
    notifications: data.notifications ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

async function fetchPageNotifications(filter: string): Promise<NotificationItem[]> {
  const res = await fetch(`/api/notifications?unreadOnly=${filter === "unread"}&limit=50`);
  if (!res.ok) throw new Error("Failed to fetch notifications");
  const data = await res.json();
  return data.notifications ?? [];
}

/** Shared hook for the notification bell (sidebar/header) — polls every 60s */
export function useBellNotifications(locale: string) {
  return useQuery({
    queryKey: notificationKeys.bell(locale),
    queryFn: () => fetchBellNotifications(locale),
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
  });
}

/** Shared hook for the full notifications page — no polling, refetches on filter change */
export function usePageNotifications(filter: "all" | "unread") {
  return useQuery({
    queryKey: notificationKeys.list(filter),
    queryFn: () => fetchPageNotifications(filter),
    staleTime: 30 * 1000,
  });
}

/** Mark all notifications as read */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) throw new Error("Failed to mark all read");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/** Mark a single notification as read */
export function useMarkOneRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error("Failed to mark notification read");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
