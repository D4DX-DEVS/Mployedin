import mongoose, { Document, Schema } from "mongoose";

/**
 * WhatsAppTemplate — a read-mostly mirror of the WABA's message templates.
 * Templates are authored and approved in Meta Business Manager; the app syncs
 * them (admin "Sync from Meta" + the message_template_status_update webhook)
 * and only ever sends templates whose mirrored status is APPROVED.
 */
export interface IWhatsAppTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  metaId: string;
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED | IN_APPEAL | DELETED | …
  bodyText: string;
  bodyParamCount: number;
  bodyParamNames: string[];
  headerFormat?: string;
  qualityScore?: string;
  rejectedReason?: string;
  components: unknown[];
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppTemplateSchema = new Schema<IWhatsAppTemplate>(
  {
    metaId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 512 },
    language: { type: String, required: true, maxlength: 16 },
    category: { type: String, required: true, maxlength: 32 },
    status: { type: String, required: true, maxlength: 32 },
    bodyText: { type: String, default: "", maxlength: 2048 },
    bodyParamCount: { type: Number, default: 0 },
    bodyParamNames: { type: [String], default: [] },
    headerFormat: { type: String, maxlength: 16 },
    qualityScore: { type: String, maxlength: 16 },
    rejectedReason: { type: String, maxlength: 200 },
    components: { type: Schema.Types.Mixed, default: [] },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const WhatsAppTemplate =
  mongoose.models.WhatsAppTemplate ||
  mongoose.model<IWhatsAppTemplate>("WhatsAppTemplate", WhatsAppTemplateSchema);

export default WhatsAppTemplate;
