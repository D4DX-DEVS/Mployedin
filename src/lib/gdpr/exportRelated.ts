/**
 * The parts of a data export (GET /api/gdpr/export) beyond the account,
 * profile and applications: everything else stored about the person.
 *
 * Other people's details are left out where they are not the person's own:
 * a referee's email and phone, an interviewer's account id, and who exactly
 * viewed a profile (the role and the date stay). Messages the person sent or
 * received in their own conversations are included in full.
 */
import type { Types } from "mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import Message from "@/models/Message";
import CvDocument from "@/models/CvDocument";
import Offer from "@/models/Offer";
import BackgroundCheck from "@/models/BackgroundCheck";
import DiversityResponse from "@/models/DiversityResponse";
import Scorecard from "@/models/Scorecard";
import ProfileView from "@/models/ProfileView";
import EmailLog from "@/models/EmailLog";
import WhatsAppMessageLog from "@/models/WhatsAppMessageLog";

export async function exportRelatedRecords(userId: string, seekerRef: unknown, applicationIds: unknown[]) {
  const seekerId = seekerRef as Types.ObjectId | undefined;
  const conversations = await Conversation.find({ participants: userId }).select("_id participants createdAt updatedAt").lean();
  const conversationIds = conversations.map((c) => c._id);

  const [directMessages, teamMessages, cvDocuments, offers, backgroundChecks, diversityResponses, scorecards, profileViews, emails, whatsappMessages] =
    await Promise.all([
      conversationIds.length
        ? DirectMessage.find({ conversationId: { $in: conversationIds } }).select("conversationId senderId content readAt createdAt").sort({ createdAt: 1 }).lean()
        : [],
      Message.find({ senderId: userId }).select("channel content createdAt").lean(),
      seekerId ? CvDocument.find({ jobSeekerId: seekerId }).lean() : [],
      seekerId ? Offer.find({ jobSeekerId: seekerId }).lean() : [],
      seekerId ? BackgroundCheck.find({ jobSeekerId: seekerId }).select("-references.email -references.phone").lean() : [],
      applicationIds.length ? DiversityResponse.find({ applicationId: { $in: applicationIds } }).lean() : [],
      seekerId ? Scorecard.find({ jobSeekerId: seekerId }).select("-evaluatedBy").lean() : [],
      // ProfileView.jobSeekerId holds the USER id (see the model).
      ProfileView.find({ jobSeekerId: userId }).select("viewerRole viewedAt -_id").sort({ viewedAt: -1 }).lean(),
      EmailLog.find({ userId }).select("to subject category status sentAt createdAt -_id").sort({ createdAt: -1 }).lean(),
      WhatsAppMessageLog.find({ userId }).select("-userId").sort({ createdAt: -1 }).lean(),
    ]);

  return {
    conversations,
    directMessages,
    teamMessages,
    cvDocuments,
    offers,
    backgroundChecks,
    diversityResponses,
    scorecards,
    profileViews,
    emails,
    whatsappMessages,
  };
}
