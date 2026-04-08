import { useQuery } from "@tanstack/react-query";

export interface Participant {
  userId: string;
  name: string;
  role: string;
  avatar?: string;
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
  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: fetchConversations,
    staleTime: 10 * 1000,
    refetchInterval: 30000,
  });
}
