import mongoose, { Schema } from "mongoose";

/**
 * One commission-rate change with the date it starts to apply. Kept as an
 * append-only list on the record it belongs to (Employer.agentCommissionRates,
 * SuperAgent.overrideRateHistory); the rate for an invoice is the latest change
 * whose `effectiveFrom` is on or before the invoice date
 * (lib/commissions/effectiveRate).
 */
export interface IRateChange {
  /** Percent, 0–100. */
  rate: number;
  /** First day (UTC) the rate applies to invoices. */
  effectiveFrom: Date;
  setBy: mongoose.Types.ObjectId;
  setByRole: "admin" | "super_agent";
  reason?: string;
  setAt: Date;
}

export const RateChangeSchema = new Schema<IRateChange>(
  {
    rate: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, required: true },
    setBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    setByRole: { type: String, enum: ["admin", "super_agent"], required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    setAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);
