import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A pending mutating Copilot tool call, awaiting explicit user confirmation.
 *
 * The AI Copilot never executes a write tool directly — it stores a proposal
 * here and streams it to the client as a confirmation card. Only
 * POST /api/ai/copilot/execute (re-verifying auth + permissions) can turn a
 * proposal into a real mutation, and it replays the args stored here rather
 * than trusting anything the client sends back — the model's raw tool-call
 * arguments are the single source of truth for what gets executed.
 *
 * TTL: proposals expire 15 minutes after creation if never confirmed.
 */
export type CopilotProposalStatus = "pending" | "executed" | "cancelled" | "expired" | "failed";

export interface ICopilotProposal extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  status: CopilotProposalStatus;
  result?: unknown;
  error?: string;
  executedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CopilotProposalSchema = new Schema<ICopilotProposal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, required: true },
    toolName: { type: String, required: true },
    args: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "executed", "cancelled", "expired", "failed"],
      default: "pending",
      index: true,
    },
    result: { type: Schema.Types.Mixed },
    error: { type: String, maxlength: 1000 },
    executedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL — MongoDB auto-deletes unconfirmed/stale proposals.
CopilotProposalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CopilotProposal: Model<ICopilotProposal> =
  (mongoose.models.CopilotProposal as Model<ICopilotProposal>) ??
  mongoose.model<ICopilotProposal>("CopilotProposal", CopilotProposalSchema);

export default CopilotProposal;
