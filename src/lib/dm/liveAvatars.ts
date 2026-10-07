import mongoose from "mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";

interface ParticipantLike {
  userId: { toString(): string };
  role?: string;
  avatar?: string | null;
}

interface ConversationLike {
  participantDetails?: ParticipantLike[] | null;
}

/**
 * Points every participant's avatar at their current photo, in place.
 *
 * The copy saved on the conversation goes stale: replacing or removing a photo
 * deletes the old file, and Spaces answers 403 for a missing object, which is
 * what the Messages page kept requesting (QA EMP-017, 2026-10-06). An employer
 * without a personal photo shows the company logo. A participant whose account
 * is gone keeps the saved copy.
 */
export async function applyLiveAvatars(conversations: ConversationLike[]): Promise<void> {
  const roles = new Map<string, string | undefined>();
  for (const conv of conversations) {
    for (const p of conv.participantDetails ?? []) roles.set(p.userId.toString(), p.role);
  }
  const ids = [...roles.keys()].filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return;

  const users = await User.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("_id avatar")
    .lean();
  const live = new Map<string, string | undefined>(
    users.map((u) => [u._id.toString(), u.avatar || undefined]),
  );

  const needLogo = [...live]
    .filter(([id, avatar]) => !avatar && roles.get(id) === "employer")
    .map(([id]) => new mongoose.Types.ObjectId(id));
  if (needLogo.length > 0) {
    const employers = await Employer.find({ userId: { $in: needLogo } }).select("userId logo").lean();
    for (const emp of employers) {
      if (emp.logo) live.set(emp.userId.toString(), emp.logo);
    }
  }

  for (const conv of conversations) {
    for (const p of conv.participantDetails ?? []) {
      const id = p.userId.toString();
      if (live.has(id)) p.avatar = live.get(id);
    }
  }
}
