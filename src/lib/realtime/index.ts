/**
 * Real-time messaging abstraction layer.
 *
 * All real-time updates are handled via React Query polling on the client side.
 * The server-side triggerRealtimeEvent() is a no-op placeholder that can be
 * extended in the future to support WebSocket, SSE, or any push service.
 *
 * Current approach: clients poll /api/dm every 5s (useConversations hook)
 * and /api/dm/[id]/messages every 5s (DirectMessageChat component).
 * This provides 3-5s latency which is acceptable for a messaging system
 * without adding external dependencies or infrastructure cost.
 */

export type RealtimeEvent = "new-message" | "new-conversation" | "messages-read" | "customer-care-update";

export interface RealtimeMessage {
  event: RealtimeEvent;
  data: Record<string, unknown>;
}

/**
 * Server-side: trigger a real-time event to a specific user.
 *
 * Currently a no-op — clients rely on polling (React Query refetchInterval).
 * This function exists as a hook point: if a push transport (WebSocket, SSE,
 * Firebase Cloud Messaging, etc.) is added later, implement it here without
 * touching any other files.
 */
export async function triggerRealtimeEvent(
  _recipientUserId: string,
  _event: RealtimeEvent,
  _data: Record<string, unknown>
): Promise<void> {
  // No-op: clients pick up changes via polling.
  // Future: add WebSocket/SSE/FCM push here.
}
