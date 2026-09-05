import { useQuery } from "@tanstack/react-query";

export interface AdminActionCounts {
  /** Support tickets in the queue that nobody has closed yet. */
  openSupportTickets: number;
  /** Of those, the ones round-robin assigned to the signed-in admin. */
  assignedSupportTickets: number;
  /** Contact-form enquiries nobody has opened. */
  unreadContactSubmissions: number;
  /** Active webhooks whose last delivery failed. */
  failingWebhooks: number;
}

const EMPTY: AdminActionCounts = {
  openSupportTickets: 0,
  assignedSupportTickets: 0,
  unreadContactSubmissions: 0,
  failingWebhooks: 0,
};

/**
 * Counts for the things waiting on an admin, used to badge navigation.
 *
 * The sibling of `useJobSeekerActionCounts`. Support tickets are the reason it
 * exists: they are assigned to a named admin and were previously invisible in
 * every navigation surface, because the unread-message counter reads `/api/dm`,
 * which excludes customer-care conversations by design.
 *
 * A failure resolves to zeroes — a missing badge is a far smaller problem than
 * navigation that throws.
 */
export function useAdminActionCounts(enabled = true) {
  const { data } = useQuery<AdminActionCounts>({
    queryKey: ["admin", "action-counts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/action-counts");
      if (!res.ok) return EMPTY;
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  return data ?? EMPTY;
}
