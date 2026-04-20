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

export function useConversations() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";

  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: fetchConversations,
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
    refetchInterval: 30_000, // Poll every 30s (balanced between freshness and load)
  });
}
