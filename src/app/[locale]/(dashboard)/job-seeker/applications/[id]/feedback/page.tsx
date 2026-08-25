"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Star, CheckCircle, Send, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";

interface ApplicationInfo {
  _id: string;
  status: string;
  jobId?: { title?: string; employerId?: { companyName?: string } };
  hasFeedback?: boolean;
}

export default function ApplicationFeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("applicationFeedback");
  const tc = useTranslations("common");

  const [app, setApp] = useState<ApplicationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [communicationRating, setCommunicationRating] = useState(0);
  const [processRating, setProcessRating] = useState(0);
  const [timelinessRating, setTimelinessRating] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setApp(data.application ?? data);
      })
      .catch(() => setError(t("errorLoadingDetails")))
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
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          aspects: {
            communicationRating: communicationRating || undefined,
            processRating: processRating || undefined,
            timelinessRating: timelinessRating || undefined,
          },
          wouldRecommend,
        }),
      });
      if (res.status === 409) {
        // Already submitted
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("submissionFailed"));
      }
      setSubmitted(true);
    } catch (e) {
      setError("We couldn't submit your feedback. Nothing was saved. Review your response and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"];
  const canSubmit = app ? TERMINAL_STATUSES.includes(app.status) : false;

  const starLabels = ["", t("starPoor"), t("starFair"), t("starGood"), t("starGreat"), t("starExcellent")];

  if (loading) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto space-y-3 sm:space-y-4">
          <div className="h-8 w-48 rounded bg-muted animate-pulse" />
          <div className="h-48 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!app || !canSubmit) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-8 sm:py-16 space-y-3 sm:space-y-4">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">{t("feedbackNotAvailable")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("feedbackOnlyAfterDecision")}
          </p>
          <Button variant="outline" onClick={() => router.push(`../applications`)}>
            {t("backToApplications")}
          </Button>
        </div>
      </div>
    );
  }

  const jobTitle = app.jobId?.title ?? "this position";
  const companyName = app.jobId?.employerId?.companyName ?? "the company";

  if (submitted) {
    return (
      <div className="page-container">
        <div className="max-w-lg mx-auto text-center py-8 sm:py-16 space-y-3 sm:space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto sm:w-16 sm:h-16">
            <CheckCircle className="w-7 h-7 text-emerald-600 sm:w-8 sm:h-8" />
          </div>
          <h2 className="text-lg font-semibold sm:text-xl">{t("thankYou")}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("feedbackRecorded", { jobTitle, companyName })}
          </p>
          <Button variant="outline" onClick={() => router.push(`../applications`)}>
            {t("backToApplications")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title={t("rateYourExperience")}
        description={t("applicationForPosition", { jobTitle, companyName })}
      />

      <div className="max-w-lg space-y-3 sm:space-y-6">
        {/* Star rating */}
        <div className="card-base text-center space-y-3 sm:space-y-4">
          <p className="text-sm font-medium text-foreground/80">
            {t("overallExperienceQuestion")}
          </p>

          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="rounded-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={t("rateStarsAria", { count: star })}
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
            <p className="text-sm font-medium text-amber-600">
              {starLabels[hovered || rating]}
            </p>
          )}
        </div>

        {/* Aspect Ratings */}
        <div className="card-base space-y-3">
          <p className="text-sm font-medium text-foreground/80">{t("rateAspectsOptional")}</p>
          {[
            { label: t("communication"), value: communicationRating, set: setCommunicationRating },
            { label: t("hiringProcess"), value: processRating, set: setProcessRating },
            { label: t("timeliness"), value: timelinessRating, set: setTimelinessRating },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => set(s)} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Star className={`w-5 h-5 ${s <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">{t("recommendEmployerQuestion")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setWouldRecommend(true)} className={`px-3 py-1.5 rounded-lg border text-sm ${wouldRecommend === true ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border hover:bg-muted"}`}>👍 {tc("yes")}</button>
              <button type="button" onClick={() => setWouldRecommend(false)} className={`px-3 py-1.5 rounded-lg border text-sm ${wouldRecommend === false ? "border-red-500 bg-red-500/10 text-red-600" : "border-border hover:bg-muted"}`}>👎 {tc("no")}</button>
            </div>
          </div>
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t("additionalComments")} <span className="text-muted-foreground font-normal">{t("optional")}</span>
          </label>
          <Textarea
            placeholder={t("commentPlaceholder")}
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
            {t("submitFeedback")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push(`../applications`)}
            disabled={submitting}
          >
            {t("skip")}
          </Button>
        </div>
      </div>
    </div>
  );
}
