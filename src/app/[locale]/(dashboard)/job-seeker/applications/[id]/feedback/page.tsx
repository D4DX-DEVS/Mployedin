"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Star, CheckCircle, Send, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";

interface ApplicationInfo {
  _id: string;
  status: string;
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  hasFeedback?: boolean;
}

export default function ApplicationFeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<ApplicationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setApp(data.application ?? data);
      })
      .catch(() => setError("Could not load application details."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (res.status === 409) {
        // Already submitted
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Submission failed");
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];
  const canSubmit = app ? TERMINAL_STATUSES.includes(app.status) : false;

  const starLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  if (loading) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="h-48 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!app || !canSubmit) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Feedback Not Available</h2>
          <p className="text-sm text-muted-foreground">
            Feedback can only be submitted after a final decision (hired, rejected, or withdrawn).
          </p>
          <Button variant="outline" onClick={() => router.push(`../applications`)}>
            Back to Applications
          </Button>
        </div>
      </div>
    );
  }

  const jobTitle = app.jobId?.title ?? "this position";
  const companyName = app.employerId?.companyName ?? "the company";

  if (submitted) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold">Thank You!</h2>
          <p className="text-sm text-muted-foreground">
            Your feedback for <strong>{jobTitle}</strong> at <strong>{companyName}</strong> has been
            recorded. Your input helps improve the hiring process for future candidates.
          </p>
          <Button variant="outline" onClick={() => router.push(`../applications`)}>
            Back to Applications
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Rate Your Experience"
        description={`Application for ${jobTitle} at ${companyName}`}
      />

      <div className="max-w-lg space-y-6">
        {/* Star rating */}
        <div className="card-base text-center space-y-4">
          <p className="text-sm font-medium text-foreground/80">
            How was your overall experience with the hiring process?
          </p>

          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="transition-transform hover:scale-110 focus:outline-none"
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    star <= (hovered || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              </button>
            ))}
          </div>

          {(hovered || rating) > 0 && (
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {starLabels[hovered || rating]}
            </p>
          )}
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Additional comments <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            placeholder="Tell us about your experience — what went well, what could improve, how the employer communicated..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Submit Feedback
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push(`../applications`)}
            disabled={submitting}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
