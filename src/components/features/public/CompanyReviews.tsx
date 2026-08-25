"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Star, ThumbsUp, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDate } from "@/lib/ui/intlFormat";

interface Review {
  _id: string;
  userId: { name: string } | null;
  rating: number;
  title: string;
  pros: string;
  cons: string;
  overallExperience?: string;
  employmentStatus?: string;
  jobTitle?: string;
  recommendToFriend?: boolean;
  isAnonymous: boolean;
  createdAt: string;
}

interface ReviewStats {
  avgRating: number;
  totalReviews: number;
  recommended: number;
  rating5: number;
  rating4: number;
  rating3: number;
  rating2: number;
  rating1: number;
}

interface CompanyReviewsProps {
  employerId: string;
  companyName: string;
}

export default function CompanyReviews({ employerId, companyName }: CompanyReviewsProps) {
  const t = useTranslations("companyReviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWriteReview, setShowWriteReview] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?employerId=${employerId}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews ?? []);
        setStats(data.stats);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [employerId]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          {t("reviews")}
        </h2>
        <button
          onClick={() => setShowWriteReview(!showWriteReview)}
          className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {t("writeReview")}
        </button>
      </div>

      {/* Stats */}
      {stats && stats.totalReviews > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{stats.avgRating.toFixed(1)}</p>
              <div className="flex gap-0.5 justify-center mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-4 h-4 ${s <= Math.round(stats.avgRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.totalReviews} {t("reviewsCount")}</p>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = stats[`rating${r}` as keyof ReviewStats] as number;
                const pct = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                return (
                  <div key={r} className="flex items-center gap-2 text-xs">
                    <span className="w-3">{r}</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
            {stats.recommended > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {Math.round((stats.recommended / stats.totalReviews) * 100)}%
                </p>
                <p className="text-xs text-muted-foreground">{t("recommend")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Write Review Form */}
      {showWriteReview && (
        <WriteReviewForm
          employerId={employerId}
          onSubmitted={() => { setShowWriteReview(false); fetchReviews(); }}
          onCancel={() => setShowWriteReview(false)}
        />
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8 bg-card border border-border rounded-xl">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">{t("noReviewsYet")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review._id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-foreground">{review.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {review.isAnonymous ? "Anonymous" : review.userId?.name ?? "User"}
                      {review.jobTitle && ` • ${review.jobTitle}`}
                      {review.employmentStatus && ` • ${review.employmentStatus} employee`}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(new Date(review.createdAt))}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 mt-3">
                <div>
                  <p className="text-xs font-medium text-green-600 mb-1">{t("pros")}</p>
                  <p className="text-sm text-muted-foreground">{review.pros}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">{t("cons")}</p>
                  <p className="text-sm text-muted-foreground">{review.cons}</p>
                </div>
              </div>
              {review.recommendToFriend !== undefined && (
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <ThumbsUp className={`w-3.5 h-3.5 ${review.recommendToFriend ? "text-green-500" : "text-muted-foreground"}`} />
                  {review.recommendToFriend ? t("recommends") : t("doesNotRecommend")} {t("thisEmployer")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WriteReviewForm({ employerId, onSubmitted, onCancel }: { employerId: string; onSubmitted: () => void; onCancel: () => void }) {
  const t = useTranslations("companyReviews");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [pros, setPros] = useState("");
  const [cons, setCons] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [recommendToFriend, setRecommendToFriend] = useState<boolean | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || !title || !pros || !cons) { toast.error(t("fillAllRequired")); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId,
          rating,
          title,
          pros,
          cons,
          jobTitle: jobTitle || undefined,
          employmentStatus: employmentStatus || undefined,
          recommendToFriend,
          isAnonymous,
        }),
      });
      if (res.ok) {
        toast.success(t("reviewSubmitted"));
        onSubmitted();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to submit");
      }
    } catch { toast.error(t("networkError")); } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 mb-4 space-y-4">
      <h3 className="font-semibold text-foreground">{t("writeReview")}</h3>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("rating")}:</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)}>
            <Star className={`w-6 h-6 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
          </button>
        ))}
      </div>

      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t("reviewTitle")} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" required maxLength={200} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-green-600">{t("pros")} *</label>
          <textarea value={pros} onChange={e => setPros(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" rows={3} required maxLength={2000} placeholder={t("whatLiked")} />
        </div>
        <div>
          <label className="text-xs font-medium text-red-600">{t("cons")} *</label>
          <textarea value={cons} onChange={e => setCons(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" rows={3} required maxLength={2000} placeholder={t("whatBetter")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder={t("yourJobTitle")} className="px-3 py-2 border border-border rounded-lg bg-background text-sm" />
        <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
          <SelectTrigger className="h-9 rounded-lg">
            <SelectValue placeholder={t("employmentStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{t("currentEmployee")}</SelectItem>
            <SelectItem value="former">{t("formerEmployee")}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="rounded" />
          {t("postAnonymously")}
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("recommendQuestion")}?</span>
        <button type="button" onClick={() => setRecommendToFriend(true)} className={`px-3 py-1 rounded border text-xs ${recommendToFriend === true ? "border-green-500 bg-green-50 text-green-600" : "border-border"}`}>👍 Yes</button>
        <button type="button" onClick={() => setRecommendToFriend(false)} className={`px-3 py-1 rounded border text-xs ${recommendToFriend === false ? "border-red-500 bg-red-50 text-red-600" : "border-border"}`}>👎 No</button>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">{t("cancel")}</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
          <Send className="w-4 h-4" />
          {submitting ? t("submitting") : t("submitReview")}
        </button>
      </div>
    </form>
  );
}
