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
  /**
   * The reply an admin sent, and who sent it.
   *
   * The inbox was a dead end: an enquiry could be read and deleted, nothing
   * else. There was no reply path, no status beyond read/unread, and therefore
   * no way to tell an answered enquiry from an ignored one.
   */
  repliedAt: Date | null;
  repliedBy: mongoose.Types.ObjectId | null;
  replyBody: string;
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
    repliedAt: { type: Date, default: null },
    repliedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    replyBody: { type: String, default: "" },
  },
  { timestamps: true }
);

ContactSubmissionSchema.index({ isRead: 1, createdAt: -1 });
ContactSubmissionSchema.index({ createdAt: -1 });

export const ContactSubmission =
  mongoose.models.ContactSubmission ||
  mongoose.model<IContactSubmission>("ContactSubmission", ContactSubmissionSchema);

export default ContactSubmission;
