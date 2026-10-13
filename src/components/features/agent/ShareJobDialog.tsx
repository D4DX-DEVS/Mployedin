"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Loader2, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getOrCreateSeekerReferralLink } from "@/lib/referrals/seekerLink";

export interface ShareableJob {
  _id: string;
  title: string;
  location?: { city?: string; country?: string; isRemote?: boolean };
  employerId?: { companyName?: string } | null;
}

/**
 * "Share job" on the agent's or super-agent's Jobs page (client: share job details in groups to
 * bring in job seekers). The link is the public job page carrying the caller's
 * job-seeker referral code, so whoever signs up by applying is credited to
 * them. The message is editable before it goes to WhatsApp or the clipboard.
 */
export function ShareJobDialog({ job, onClose, locale }: { job: ShareableJob | null; onClose: () => void; locale: string }) {
  const t = useTranslations("agentJobs.share");
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeFailed, setCodeFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // The code is the same for every job; fetch it once per opening.
  useEffect(() => {
    if (!job || code) return;
    let alive = true;
    setLoading(true);
    setCodeFailed(false);
    getOrCreateSeekerReferralLink(t("linkLabel"))
      .then((link) => { if (alive) setCode(link.code); })
      .catch(() => { if (alive) setCodeFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [job, code, t]);

  const url = job
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/${locale}/jobs/${job._id}${code ? `?ref=${encodeURIComponent(code)}` : ""}`
    : "";
  const place = job?.location?.isRemote
    ? t("remote")
    : [job?.location?.city, job?.location?.country].filter(Boolean).join(", ");

  // A fresh message whenever the job or the link changes; edits after that stay.
  useEffect(() => {
    if (!job || loading) return;
    setMessage(t("message", { title: job.title, company: job.employerId?.companyName || t("companyFallback"), location: place || "—", url }));
  }, [job, loading, url, place, t]);

  const copy = async (what: "link" | "message") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : message);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: job?.title, text: message });
    } catch {
      // Cancelled by the user, or not allowed: nothing to report.
    }
  };

  return (
    <Dialog open={job !== null} onOpenChange={(o) => { if (!o) { setCopied(null); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("preparing")}
          </div>
        ) : (
          <div className="space-y-4">
            {codeFailed && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("noCode")}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="share-job-link">{t("linkLabel")}</Label>
              <div className="flex gap-2">
                <Input id="share-job-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 text-xs" />
                <Button type="button" variant="outline" onClick={() => void copy("link")} className="shrink-0 gap-1.5">
                  {copied === "link" ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied === "link" ? t("copied") : t("copyLink")}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-job-message">{t("messageLabel")}</Label>
              <Textarea id="share-job-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t("whatsapp")}
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={() => void copy("message")} className="gap-1.5">
                {copied === "message" ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied === "message" ? t("copied") : t("copyMessage")}
              </Button>
              {canNativeShare && (
                <Button type="button" variant="outline" onClick={() => void nativeShare()} className="gap-1.5">
                  <Share2 className="h-4 w-4" aria-hidden="true" /> {t("more")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
