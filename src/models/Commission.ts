import mongoose, { Document, Schema } from "mongoose";

export type CommissionType = "placement" | "override" | "bonus";
export type CommissionStatus = "pending" | "approved" | "paid" | "disputed";

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
      enum: ["pending", "approved", "paid", "disputed"],
      default: "pending",
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    paidAt: Date,
    paymentRef: String,
    notes: String,
  },
  { timestamps: true }
);

CommissionSchema.index({ agentId: 1 });
CommissionSchema.index({ superAgentId: 1 });
CommissionSchema.index({ status: 1 });
CommissionSchema.index({ invoiceId: 1 });
CommissionSchema.index({ placementId: 1 });

export const Commission =
  mongoose.models.Commission ||
  mongoose.model<ICommission>("Commission", CommissionSchema);
export default Commission;
