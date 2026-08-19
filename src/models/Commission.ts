import mongoose, { Document, Schema } from "mongoose";

export type CommissionType = "placement" | "override" | "bonus";
export type CommissionStatus = "pending" | "approved" | "paid" | "disputed" | "clawed_back";

export interface ICommission extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId;
  placementId?: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  type: CommissionType;
  amount: number;
  currency: string;
  rate?: number; // percentage
  status: CommissionStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  paidAt?: Date;
  paymentRef?: string;
  notes?: string;
  // Dispute fields
  disputeReason?: string;
  disputedBy?: mongoose.Types.ObjectId;
  disputedAt?: Date;
  disputeResolution?: "resolved" | "rejected" | "escalated";
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  // Clawback fields
  clawbackAmount?: number;
  clawbackReason?: string;
  clawbackBy?: mongoose.Types.ObjectId;
  clawbackAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema = new Schema<ICommission>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    placementId: { type: Schema.Types.ObjectId, ref: "Placement" },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    type: {
      type: String,
      enum: ["placement", "override", "bonus"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "AED" },
    rate: Number,
    status: {
      type: String,
      enum: ["pending", "approved", "paid", "disputed", "clawed_back"],
      default: "pending",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    paidAt: Date,
    paymentRef: String,
    notes: String,
    // Dispute
    disputeReason: { type: String, maxlength: 1000 },
    disputedBy: { type: Schema.Types.ObjectId, ref: "User" },
    disputedAt: Date,
    disputeResolution: { type: String, enum: ["resolved", "rejected", "escalated"] },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    // Clawback
    clawbackAmount: { type: Number, min: 0 },
    clawbackReason: { type: String, maxlength: 1000 },
    clawbackBy: { type: Schema.Types.ObjectId, ref: "User" },
    clawbackAt: Date,
  },
  { timestamps: true }
);

CommissionSchema.index({ agentId: 1 });
CommissionSchema.index({ superAgentId: 1 });
CommissionSchema.index({ status: 1 });
CommissionSchema.index({ invoiceId: 1 });
// Idempotency guard: one commission per (invoice, agent, type) — backs the countDocuments
// check in commissionRecords.ts against concurrent duplicate creation
CommissionSchema.index(
  { invoiceId: 1, agentId: 1, type: 1 },
  { unique: true, partialFilterExpression: { invoiceId: { $exists: true } } }
);
CommissionSchema.index({ placementId: 1 });

export const Commission =
  mongoose.models.Commission ||
  mongoose.model<ICommission>("Commission", CommissionSchema);
export default Commission;
