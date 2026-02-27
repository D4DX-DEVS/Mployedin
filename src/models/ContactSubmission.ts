import mongoose, { Document, Schema } from "mongoose";

export interface IContactSubmission extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isRead: boolean;
  readAt: Date | null;
  readBy: mongoose.Types.ObjectId | null;
  ipAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSubmissionSchema = new Schema<IContactSubmission>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    subject: { type: String, default: "", trim: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    readBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    ipAddress: { type: String, default: "unknown" },
  },
  { timestamps: true }
);

ContactSubmissionSchema.index({ isRead: 1, createdAt: -1 });
ContactSubmissionSchema.index({ createdAt: -1 });

export const ContactSubmission =
  mongoose.models.ContactSubmission ||
  mongoose.model<IContactSubmission>("ContactSubmission", ContactSubmissionSchema);

export default ContactSubmission;
