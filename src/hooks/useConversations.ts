"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { getPusherClient } from "@/lib/pusherClient";

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
  const queryClient = useQueryClient();
  const currentUserId = (session?.user as unknown as { id?: string })?.id ?? "";

  // Invalidate conversation list when a new conversation is created by someone else
  useEffect(() => {
    if (!currentUserId || !process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    try {
      const pusher = getPusherClient();
      const channel = pusher.subscribe(`private-dm-${currentUserId}`);
      channel.bind("new-conversation", () => {
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
      });
      // Also refresh on incoming messages so unread counts update
      channel.bind("new-message", () => {
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
      });
      return () => {
        channel.unbind("new-conversation");
        channel.unbind("new-message");
      };
    } catch {
      // Pusher not configured — polling will handle updates
    }
  }, [currentUserId, queryClient]);

  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: fetchConversations,
    staleTime: 10 * 1000,
    refetchInterval: 60000, // fallback polling every 60s (Pusher handles real-time)
  });
}
