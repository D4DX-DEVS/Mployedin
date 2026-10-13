"use client";

import { useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

export interface Participant {
  userId: string;
  name: string;
  role: string;
  avatar?: string;
  headline?: string;
  companyName?: string;
}

export interface Conversation {
  _id: string;
  participants: string[];
  participantDetails: Participant[];
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCounts?: Record<string, number>;
  customerCare?: {
    status: "open" | "assigned" | "resolved" | "closed";
    priority: "low" | "medium" | "high" | "urgent";
    category?: string;
    assignedTo?: string;
    resolvedAt?: string;
    closedAt?: string;
  };
}

interface ConversationsPage {
  conversations: Conversation[];
  nextCursor: string | null;
}

export const conversationKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationKeys.all, "list"] as const,
  /** Paged list for one search term. Under `lists()` so every existing
   *  invalidation (send, read, delete) refreshes it. */
  infinite: (search: string) => [...conversationKeys.lists(), "infinite", search] as const,
  /** Under `lists()` too: marking a conversation read must clear the badge. */
  unread: () => [...conversationKeys.lists(), "unread"] as const,
};

/** Conversations per page; the API caps it at 50. */
const PAGE_SIZE = 30;

async function fetchConversationsPage(search: string, cursor: string | null): Promise<ConversationsPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (search) params.set("search", search);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/dm?${params}`);

  if (!response.ok) {
    throw new Error("Couldn't load conversations");
  }

  const data = await response.json();
  return { conversations: data.conversations ?? [], nextCursor: data.nextCursor ?? null };
}

/**
 * The Messages list, newest first, loaded a page at a time (`fetchNextPage`
 * as the list scrolls). `search` runs on the server, so it finds
 * conversations that have not been loaded yet.
 */
export function useConversations(options?: { enabled?: boolean; search?: string }) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";
  const externalEnabled = options?.enabled ?? true;
  const search = options?.search?.trim() ?? "";

  const query = useInfiniteQuery({
    queryKey: conversationKeys.infinite(search),
    queryFn: ({ pageParam }) => fetchConversationsPage(search, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!currentUserId && externalEnabled,
    staleTime: 30 * 1000,
    refetchInterval: externalEnabled ? 30_000 : false,
  });

  // A conversation can move between pages while they load (a new message
  // lifts it to the top), so keep the first copy only.
  const conversations = useMemo(() => {
    const seen = new Set<string>();
    const out: Conversation[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const c of page.conversations) {
        if (seen.has(c._id)) continue;
        seen.add(c._id);
        out.push(c);
      }
    }
    return out;
  }, [query.data]);

  return { ...query, conversations };
}

/** Total unread direct messages, counted on the server across every conversation. */
export function useDmUnreadTotal(options?: { enabled?: boolean }): number {
  const { data: session } = useSession();
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";
  const externalEnabled = options?.enabled ?? true;

  const { data } = useQuery({
    queryKey: conversationKeys.unread(),
    queryFn: async () => {
      const res = await fetch("/api/dm/unread-count");
      if (!res.ok) throw new Error("Couldn't load unread messages");
      const body = await res.json();
      return (body.total ?? 0) as number;
    },
    enabled: !!currentUserId && externalEnabled,
    staleTime: 30 * 1000,
    refetchInterval: externalEnabled ? 30_000 : false,
  });

  return data ?? 0;
}

/**
 * Total unread direct messages for the signed-in user.
 *
 * Shared by the sidebar's Messages badge and the phone tab bar, so the two
 * cannot drift — on a phone the sidebar sits behind "More", and without a
 * signal out there a reply is invisible until the user goes looking.
 */
export function useUnreadMessageCount(): number {
  const { data: session } = useSession();
  const currentUserId = (session?.user as unknown as { id?: string } | undefined)?.id ?? "";
  const role = (session?.user as unknown as { role?: string } | undefined)?.role;
  const dmCount = useDmUnreadTotal();
  const isJobSeeker = role === "job_seeker";

  const { data: customerCareConvs } = useQuery({
    queryKey: ["customerCareConversations"],
    queryFn: async () => {
      const res = await fetch("/api/dm/customer-care?limit=50");
      if (!res.ok) throw new Error("Failed to fetch customer care conversations");
      const data = await res.json();
      return (data.conversations ?? []) as Conversation[];
    },
    enabled: !!currentUserId && isJobSeeker,
    staleTime: 30 * 1000,
    refetchInterval: isJobSeeker ? 30_000 : false,
  });

  if (!currentUserId) return 0;
  const ccCount = isJobSeeker
    ? (customerCareConvs ?? []).reduce(
        (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
        0
      )
    : 0;

  return dmCount + ccCount;
}
