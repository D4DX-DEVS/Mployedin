import mongoose, { Document, Model, Schema } from "mongoose";
import crypto from "crypto";

/**
 * Platform-wide, read-only "AI Data Access" key (`mpi_…`). Issued by an admin
 * so an external AI (ChatGPT Actions, Claude tool-use, n8n, …) can read the
 * /api/insights surface. Unlike the employer-scoped ApiKey (`mpd_…`) this key
 * sees every tenant, so it is admin-issued only and never grants writes.
 *
 * Only the SHA-256 hash is stored; the plaintext is shown once on creation.
 */
export type PlatformApiKeyScope = "insights:read" | "pii:read";

export const PLATFORM_API_KEY_SCOPES: PlatformApiKeyScope[] = ["insights:read", "pii:read"];

/** `mpi_` + 48 hex chars (24 random bytes). */
export const PLATFORM_API_KEY_PATTERN = /^mpi_[a-f0-9]{48}$/;

export interface IPlatformApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  keyPrefix: string; // first 12 chars ("mpi_" + 8 hex) for identification
  keyHash: string; // SHA-256 hash of the full key
  scopes: PlatformApiKeyScope[];
  isActive: boolean;
  expiresAt?: Date;
  rateLimitPerMin: number;
  totalRequests: number;
  lastUsedAt?: Date;
  revokedAt?: Date;
  revokedBy?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export function hashPlatformApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generatePlatformApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const key = `mpi_${crypto.randomBytes(24).toString("hex")}`;
  return { key, keyPrefix: key.substring(0, 12), keyHash: hashPlatformApiKey(key) };
}

interface PlatformApiKeyModel extends Model<IPlatformApiKey> {
  generateKey(): { key: string; keyPrefix: string; keyHash: string };
  hashKey(key: string): string;
}

const PlatformApiKeySchema = new Schema<IPlatformApiKey, PlatformApiKeyModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: {
      type: [{ type: String, enum: PLATFORM_API_KEY_SCOPES }],
      default: ["insights:read"],
      validate: {
        validator: (v: string[]) => v.includes("insights:read"),
        message: "insights:read scope is required",
      },
    },
    isActive: { type: Boolean, default: true },
    expiresAt: Date,
    rateLimitPerMin: { type: Number, default: 120, min: 10, max: 1000 },
    totalRequests: { type: Number, default: 0 },
    lastUsedAt: Date,
    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

PlatformApiKeySchema.index({ keyPrefix: 1 });
PlatformApiKeySchema.index({ isActive: 1, createdAt: -1 });

PlatformApiKeySchema.statics.generateKey = generatePlatformApiKey;
PlatformApiKeySchema.statics.hashKey = hashPlatformApiKey;

export const PlatformApiKey =
  (mongoose.models.PlatformApiKey as PlatformApiKeyModel) ||
  mongoose.model<IPlatformApiKey, PlatformApiKeyModel>("PlatformApiKey", PlatformApiKeySchema);
export default PlatformApiKey;
