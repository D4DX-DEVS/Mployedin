"use client";

import { useQuery } from "@tanstack/react-query";
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

interface ConversationsResponse {
  conversations: Conversation[];
}

export const conversationKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationKeys.all, "list"] as const,
};

async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch("/api/dm");

  if (!response.ok) {
    throw new Error("Failed to fetch conversations");
  }

  const data: ConversationsResponse = await response.json();
  return data.conversations;
}

export function useConversations(options?: { enabled?: boolean }) {
  const { data: session } = useSession();
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";
  const externalEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: fetchConversations,
    enabled: !!currentUserId && externalEnabled,
    staleTime: 30 * 1000,
    refetchInterval: externalEnabled ? 30_000 : false,
  });
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
  const { data: conversations } = useConversations();
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
  const dmCount = (conversations ?? []).reduce(
    (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
    0
  );
  const ccCount = isJobSeeker
    ? (customerCareConvs ?? []).reduce(
        (sum, c) => sum + (c.unreadCounts?.[currentUserId] ?? 0),
        0
      )
    : 0;

  return dmCount + ccCount;
}
