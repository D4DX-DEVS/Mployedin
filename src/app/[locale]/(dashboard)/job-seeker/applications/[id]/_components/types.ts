/** Shapes the application page reads from GET /api/applications/[id]. */

export interface InterviewItem {
  _id: string;
  type: "video" | "offline" | "hybrid";
  scheduledAt: string;
  duration: number;
  location?: string;
  meetLink?: string;
  instructions?: string;
  status: string;
  interviewRound: number;
  candidateResponse: string;
  outcome?: string;
}

export interface AutomatedDecisionItem {
  kind: "auto_reject";
  score: number;
  threshold: number;
  decidedAt: string;
  reviewRequestedAt?: string;
  reviewedAt?: string;
}

export interface BackgroundCheckItem {
  _id: string;
  checkType: "background" | "reference" | "both";
  status: "pending" | "in_progress" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface OfferItem {
  _id: string;
  salary?: { amount: number; currency: string; period: string };
  startDate?: string;
  benefits?: string;
  status: string;
  expiresAt?: string;
}
