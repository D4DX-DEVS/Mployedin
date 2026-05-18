import mongoose, { Document, Schema } from "mongoose";

export interface IResourceDownloadLog extends Document {
  _id: mongoose.Types.ObjectId;
  resourceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fileKey: string;
  fileName: string;
  downloadedAt: Date;
}

const ResourceDownloadLogSchema = new Schema<IResourceDownloadLog>(
  {
    resourceId: { type: Schema.Types.ObjectId, ref: "Resource", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileKey: { type: String, required: true },
    fileName: { type: String, required: true, trim: true },
    downloadedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

ResourceDownloadLogSchema.index({ resourceId: 1, downloadedAt: -1 });
ResourceDownloadLogSchema.index({ userId: 1, downloadedAt: -1 });

export default mongoose.models.ResourceDownloadLog ??
  mongoose.model<IResourceDownloadLog>("ResourceDownloadLog", ResourceDownloadLogSchema);
