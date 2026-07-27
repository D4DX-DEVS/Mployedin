import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

/**
 * A ChatGPT connector (or any MCP client) that has dynamically registered
 * itself via RFC 7591. Public client only — PKCE (S256) replaces a client
 * secret, since a client_secret can't be kept confidential by ChatGPT's
 * infrastructure.
 */
export interface IMcpClient extends Document {
  _id: mongoose.Types.ObjectId;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  logoUri?: string;
  createdAt: Date;
}

const McpClientSchema = new Schema<IMcpClient>(
  {
    clientId: { type: String, required: true, unique: true },
    clientName: { type: String, required: true, trim: true, maxlength: 200 },
    redirectUris: [{ type: String, required: true }],
    logoUri: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

McpClientSchema.index({ clientId: 1 });

McpClientSchema.statics.generateClientId = function () {
  return `mcpc_${crypto.randomBytes(16).toString("hex")}`;
};

export default mongoose.models.McpClient || mongoose.model<IMcpClient>("McpClient", McpClientSchema);
