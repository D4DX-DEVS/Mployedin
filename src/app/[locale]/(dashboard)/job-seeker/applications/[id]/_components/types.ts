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

export interface OfferItem {
  _id: string;
  salary?: { amount: number; currency: string; period: string };
  startDate?: string;
  benefits?: string;
  status: string;
  expiresAt?: string;
}
