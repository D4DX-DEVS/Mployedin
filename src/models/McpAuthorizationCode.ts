import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";
import type { UserRole } from "@/types/user";
import type { McpScope } from "@/lib/mcp/scopes";

/** Short-lived, single-use OAuth 2.1 authorization code (PKCE-bound). */
export interface IMcpAuthorizationCode extends Document {
  _id: mongoose.Types.ObjectId;
  codeHash: string;
  clientId: string;
  userId: mongoose.Types.ObjectId;
  role: UserRole;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  scopes: McpScope[];
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

const McpAuthorizationCodeSchema = new Schema<IMcpAuthorizationCode>(
  {
    codeHash: { type: String, required: true, unique: true },
    clientId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    redirectUri: { type: String, required: true },
    resource: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    scopes: [{ type: String }],
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

McpAuthorizationCodeSchema.index({ codeHash: 1 });
// TTL — Mongo auto-deletes expired, unconsumed codes
McpAuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

McpAuthorizationCodeSchema.statics.generateCode = function () {
  const code = `mcpac_${crypto.randomBytes(32).toString("hex")}`;
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, codeHash };
};

McpAuthorizationCodeSchema.statics.hashCode = function (code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
};

export default mongoose.models.McpAuthorizationCode ||
  mongoose.model<IMcpAuthorizationCode>("McpAuthorizationCode", McpAuthorizationCodeSchema);
