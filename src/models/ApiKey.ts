import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

export type ApiKeyScope = "read:jobs" | "write:jobs" | "read:applications" | "write:applications" | "read:candidates" | "webhooks" | "full_access";

export const API_KEY_SCOPES: ApiKeyScope[] = [
  "read:jobs", "write:jobs", "read:applications", "write:applications",
  "read:candidates", "webhooks", "full_access",
];

export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  keyPrefix: string; // first 8 chars for identification
  keyHash: string; // SHA-256 hash of the full key
  scopes: ApiKeyScope[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  rateLimit: number; // requests per minute
  totalRequests: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: [{ type: String, enum: API_KEY_SCOPES }],
    isActive: { type: Boolean, default: true },
    lastUsedAt: Date,
    expiresAt: Date,
    rateLimit: { type: Number, default: 60, min: 10, max: 1000 },
    totalRequests: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ApiKeySchema.index({ keyHash: 1 });
ApiKeySchema.index({ employerId: 1 });
ApiKeySchema.index({ keyPrefix: 1 });

ApiKeySchema.statics.generateKey = function () {
  const key = `mpd_${crypto.randomBytes(32).toString("hex")}`;
  const keyPrefix = key.substring(0, 12);
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, keyPrefix, keyHash };
};

ApiKeySchema.statics.hashKey = function (key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
};

export default mongoose.models.ApiKey || mongoose.model<IApiKey>("ApiKey", ApiKeySchema);
