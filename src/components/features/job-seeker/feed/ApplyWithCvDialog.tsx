"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2, Upload, Zap } from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProfileDocument {
  id: string;
  name: string;
  category: string;
  url: string;
}

interface ApplyWithCvDialogProps {
  jobId: string;
  jobTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful application (or 409 already-applied). */
  onApplied: (jobId: string) => void;
}

const PROFILE_CV_KEY = "__profile_cv__";

export function ApplyWithCvDialog({
  jobId,
  jobTitle,
  open,
  onOpenChange,
  onApplied,
}: ApplyWithCvDialogProps) {
  const t = useTranslations("jobFeed.cvApply");

  const [loadingDocs, setLoadingDocs] = useState(false);
  const [resumeDocs, setResumeDocs] = useState<ProfileDocument[]>([]);
  const [hasProfileCv, setHasProfileCv] = useState(false);
  const [selectedCvKey, setSelectedCvKey] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load the seeker's CVs when the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setLoadingDocs(true);
    fetch("/api/job-seeker/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.jobSeeker) return;
        const js = data.jobSeeker;
        const docs: ProfileDocument[] = Array.isArray(js.documents) ? js.documents : [];
        const resumes = docs.filter((d) => d.category === "resume");
        setResumeDocs(resumes);
        setHasProfileCv(!!js.cvUrl);
        // Default selection: most recent resume doc, else profile CV
        if (resumes.length > 0) setSelectedCvKey(resumes[resumes.length - 1].id);
        else if (js.cvUrl) setSelectedCvKey(PROFILE_CV_KEY);
        else setSelectedCvKey("");
      })
      .catch(() => {
        if (!cancelled) setError(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoadingDocs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "resume");
      const res = await csrfFetch("/api/job-seeker/documents", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.document) {
        setError(data?.error ?? t("uploadFailed"));
        return;
      }
      const doc: ProfileDocument = {
        id: data.document.id,
        name: data.document.name,
        category: data.document.category,
        url: data.document.url,
      };
      setResumeDocs((prev) => [...prev, doc]);
      setSelectedCvKey(doc.id);
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!selectedCvKey) {
      setError(t("selectCvFirst"));
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const includeProfileCv = selectedCvKey === PROFILE_CV_KEY;
      const res = await csrfFetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          easyApply: true,
          documentIds: includeProfileCv ? undefined : [selectedCvKey],
          includeProfileCv: includeProfileCv || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409) {
        // Already applied — treat as success so the card updates
        onApplied(jobId);
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        // Plan-quota errors get a friendly upgrade prompt instead of the raw
        // server code ("LIMIT_EXCEEDED" / "SUBSCRIPTION_REQUIRED").
        if (data?.error === "LIMIT_EXCEEDED" || data?.error === "SUBSCRIPTION_REQUIRED") {
          setError(t("planLimitReached"));
        } else {
          setError(data?.error ?? t("applyFailed"));
        }
        return;
      }
      onApplied(jobId);
      onOpenChange(false);
    } catch {
      setError(t("applyFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const noCvAvailable = !loadingDocs && resumeDocs.length === 0 && !hasProfileCv;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription className="line-clamp-1">{jobTitle}</DialogDescription>
        </DialogHeader>

        {loadingDocs ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5 rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("chooseCv")}
              </p>
              {hasProfileCv && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="feed-cv-choice"
                    checked={selectedCvKey === PROFILE_CV_KEY}
                    onChange={() => setSelectedCvKey(PROFILE_CV_KEY)}
                    className="accent-primary"
                  />
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {t("profileCv")}
                </label>
              )}
              {resumeDocs.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="feed-cv-choice"
                    checked={selectedCvKey === d.id}
                    onChange={() => setSelectedCvKey(d.id)}
                    className="accent-primary"
                  />
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
              {noCvAvailable && (
                <p className="text-xs text-muted-foreground/70">{t("noCvOnFile")}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || submitting}
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 h-8 gap-1.5 rounded-xl text-xs"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? t("uploading") : t("uploadUpdatedCv")}
              </Button>
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={submitting || loadingDocs || uploading || !selectedCvKey}
            onClick={handleSubmit}
            className="gap-1.5 rounded-xl"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {submitting ? t("applying") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
