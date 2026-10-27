import mongoose, { Document, Schema } from "mongoose";
import { d1LogMirror } from "@/lib/logs/logStore";

export interface IProfileView extends Document {
  _id: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  viewerId: mongoose.Types.ObjectId;
  viewerRole: "employer" | "agent" | "super_agent";
  source?: "search" | "application" | "direct";
  viewedAt: Date;
  notifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileViewSchema = new Schema<IProfileView>(
  {
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    viewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    viewerRole: {
      type: String,
      enum: ["employer", "agent", "super_agent"],
      required: true,
    },
    source: {
      type: String,
      enum: ["search", "application", "direct"],
    },
    viewedAt: { type: Date, default: Date.now },
    notifiedAt: { type: Date },
  },
  { timestamps: true }
);

ProfileViewSchema.index({ jobSeekerId: 1, viewedAt: -1 });
ProfileViewSchema.index({ viewerId: 1, viewedAt: -1 });
ProfileViewSchema.index(
  { jobSeekerId: 1, viewerId: 1, viewedAt: -1 },
  { name: "dedup_lookup" }
);

// LOGS_STORE=dual: every insert is also copied to D1 (lib/logs/logStore.ts).
ProfileViewSchema.plugin(d1LogMirror("profile_view"));

export const ProfileView =
  mongoose.models.ProfileView ||
  mongoose.model<IProfileView>("ProfileView", ProfileViewSchema);
export default ProfileView;
