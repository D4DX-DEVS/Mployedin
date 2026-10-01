import mongoose, { Document, Schema } from "mongoose";

/**
 * One invitation to apply: a candidate, a job, who sent it.
 *
 * The unique (jobId, jobSeekerId) index is the guard against inviting the same
 * person to the same job twice — the employer and their agent may work the same
 * list, and a double-click must not send two emails. The record is written
 * BEFORE the notification goes out (see lib/jobs/jobInvites.ts).
 */
export interface IJobInvite extends Document {
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  invitedBy: mongoose.Types.ObjectId;
  invitedByRole: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobInviteSchema = new Schema<IJobInvite>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobSeekerId: { type: Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    invitedByRole: { type: String, required: true },
  },
  { timestamps: true }
);

JobInviteSchema.index({ jobId: 1, jobSeekerId: 1 }, { unique: true });

export const JobInvite =
  (mongoose.models.JobInvite as mongoose.Model<IJobInvite>) ||
  mongoose.model<IJobInvite>("JobInvite", JobInviteSchema);

export default JobInvite;
