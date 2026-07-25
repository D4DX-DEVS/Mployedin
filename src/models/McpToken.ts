import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";
import type { UserRole } from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";

/** OAuth 2.1 access/refresh token pair issued to an MCP client (e.g. ChatGPT). Only hashes are stored, mirroring ApiKey. */
export interface IMcpToken extends Document {
  _id: mongoose.Types.ObjectId;
  accessTokenHash: string;
  refreshTokenHash?: string;
  clientId: string;
  userId: mongoose.Types.ObjectId;
  role: UserRole;
  scopes: McpScope[];
  isRevoked: boolean;
  lastUsedAt?: Date;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const McpTokenSchema = new Schema<IMcpToken>(
  {
    accessTokenHash: { type: String, required: true, unique: true },
    refreshTokenHash: { type: String, unique: true, sparse: true },
    clientId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    scopes: [{ type: String }],
    isRevoked: { type: Boolean, default: false },
    lastUsedAt: Date,
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: Date,
  },
  { timestamps: true }
);

McpTokenSchema.index({ accessTokenHash: 1 });
McpTokenSchema.index({ refreshTokenHash: 1 });
McpTokenSchema.index({ userId: 1 });

const PREFIX = { access: "mcp_at_", refresh: "mcp_rt_" } as const;

function mint(prefix: string) {
  const token = `${prefix}${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

McpTokenSchema.statics.generateAccessToken = function () {
  return mint(PREFIX.access);
};

McpTokenSchema.statics.generateRefreshToken = function () {
  return mint(PREFIX.refresh);
};

McpTokenSchema.statics.hashToken = function (token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export default mongoose.models.McpToken || mongoose.model<IMcpToken>("McpToken", McpTokenSchema);
