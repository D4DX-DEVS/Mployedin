import logger from "@/lib/logger";

/**
 * Tell the reviewing super-agent that an exhibition request is waiting on them.
 *
 * Reviewing these is the one approval a super-agent alone performs
 * (`exhibitions: ["read","update","approve"]` in the permission matrix), and it
 * used to produce no notification at all — the queue was discoverable only by
 * remembering to open "Exhibition Requests" in the sidebar.
 *
 * Resolves the SuperAgent document to its user id and the submitting agent to a
 * display name. Never throws: a submission must not fail because a notification
 * could not be written.
 */
export async function notifySuperAgentOfExhibition(
  superAgentProfileId: string,
  agentUserId: string,
  eventName: string,
  exhibitionId: string,
  locale = "en",
): Promise<void> {
  try {
    const [{ default: SuperAgent }, { default: User }, { notifySuperAgentExhibitionRequest }] =
      await Promise.all([
        import("@/models/SuperAgent"),
        import("@/models/User"),
        import("@/lib/notifications/trigger"),
      ]);

    const [saDoc, agentUser] = await Promise.all([
      SuperAgent.findById(superAgentProfileId).select("userId").lean(),
      User.findById(agentUserId).select("name email").lean(),
    ]);
    if (!saDoc?.userId) return;

    await notifySuperAgentExhibitionRequest(
      String(saDoc.userId),
      (agentUser?.name as string) || (agentUser?.email as string) || "An agent",
      eventName,
      exhibitionId,
      locale,
    );
  } catch (err) {
    logger.error({ err, exhibitionId }, "Failed to notify super agent of exhibition request");
  }
}
