import mongoose, { Document, Schema } from "mongoose";

export interface IApplicationFeedback extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  aspects?: {
    communicationRating?: number;
    processRating?: number;
    timelinessRating?: number;
    transparencyRating?: number;
  };
  wouldRecommend?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationFeedbackSchema = new Schema<IApplicationFeedback>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
    aspects: {
      communicationRating: { type: Number, min: 1, max: 5 },
      processRating: { type: Number, min: 1, max: 5 },
      timelinessRating: { type: Number, min: 1, max: 5 },
      transparencyRating: { type: Number, min: 1, max: 5 },
    },
    wouldRecommend: { type: Boolean },
  },
  { timestamps: true }
);

ApplicationFeedbackSchema.index({ applicationId: 1 }, { unique: true });
ApplicationFeedbackSchema.index({ employerId: 1 });
ApplicationFeedbackSchema.index({ userId: 1 });

export const ApplicationFeedback =
  mongoose.models.ApplicationFeedback ||
  mongoose.model<IApplicationFeedback>("ApplicationFeedback", ApplicationFeedbackSchema);
export default ApplicationFeedback;
