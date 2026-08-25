"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, ClipboardList, Loader2, FileText, Upload, PenLine, CheckCircle2,
  Circle, Download, Building2, Calendar, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";
import { formatDate as formatIntlDate } from "@/lib/ui/intlFormat";

type OnboardingStatus = "not_started" | "in_progress" | "completed";
type DocStatus = "requested" | "submitted" | "signed" | "approved";

interface OnboardingDoc {
  index: number;
  name: string;
  url: string | null;
  requestedFromCandidate: boolean;
  requiresSignature: boolean;
  status: DocStatus | null;
  uploadedBy: string | null;
  dueDate: string | null;
  signature: { fullName: string; signedAt: string } | null;
}

interface OnboardingTask {
  title: string;
  completed: boolean;
}

interface Onboarding {
  _id: string;
  status: OnboardingStatus;
  startDate: string | null;
  probation: { endDate: string | null; status: string | null } | null;
  tasks: OnboardingTask[];
  documents: OnboardingDoc[];
  placement: { jobTitle: string | null; companyName: string | null; startDate: string | null };
}

const DOC_STATUS_STYLES: Record<DocStatus, string> = {
  requested: "bg-amber-100 text-amber-700 border-amber-300",
  submitted: "bg-sky-100 text-sky-700 border-sky-300",
  signed: "bg-emerald-100 text-emerald-700 border-emerald-300",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  try {
    return formatIntlDate(new Date(value), { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function JobSeekerOnboardingPage() {
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("jobSeekerOnboarding");

  const [onboardings, setOnboardings] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/job-seeker/onboarding");
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOnboardings(Array.isArray(data.onboardings) ? data.onboardings : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page-container max-w-4xl">
      <div className="flex flex-col gap-2">
        <Link
          href={`/${locale}/job-seeker/applications`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToApplications")}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <ClipboardList className="h-6 w-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : onboardings.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-6">
          {onboardings.map((onboarding) => (
            <OnboardingCard key={onboarding._id} onboarding={onboarding} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function OnboardingCard({ onboarding, onChanged }: { onboarding: Onboarding; onChanged: () => void }) {
  const t = useTranslations("jobSeekerOnboarding");

  const tasks = onboarding.tasks ?? [];
  const doneCount = tasks.filter((task) => task.completed).length;
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const actionDocs = onboarding.documents.filter((doc) => doc.requestedFromCandidate);
  const sharedDocs = onboarding.documents.filter((doc) => !doc.requestedFromCandidate && doc.url);

  const company = onboarding.placement.companyName ?? t("yourEmployer");
  const startDate = onboarding.startDate ?? onboarding.placement.startDate;

  const statusStyle =
    onboarding.status === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : onboarding.status === "in_progress" ? "bg-blue-100 text-blue-700 border-blue-300"
      : "bg-amber-100 text-amber-700 border-amber-300";

  return (
    <div className="space-y-4 sm:space-y-5 rounded-3xl border border-border bg-card p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary sm:text-sm">
            <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {company}
          </div>
          {onboarding.placement.jobTitle && (
            <p className="text-base font-semibold text-foreground sm:text-lg">{onboarding.placement.jobTitle}</p>
          )}
          {startDate && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              {t("startDate", { date: formatDate(startDate) })}
            </p>
          )}
        </div>
        <Badge variant="outline" className={statusStyle}>
          {t(`status_${onboarding.status}`)}
        </Badge>
      </div>

      {/* Welcome */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3 sm:p-4 text-xs sm:text-sm text-blue-900">
        {t("welcomeMessage", { company })}
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{t("progress")}</p>
            <p className="text-sm text-muted-foreground">{t("tasksDone", { done: doneCount, total: tasks.length })}</p>
          </div>
          <Progress value={progress} className="h-2" />
          <ul className="space-y-1.5">
            {tasks.map((task, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {task.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                )}
                <span className={task.completed ? "text-muted-foreground line-through" : "text-foreground"}>
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Probation */}
      {onboarding.probation?.endDate && (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 p-4 text-sm">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {t("probationEnds", { date: formatDate(onboarding.probation.endDate) })}
          </span>
        </div>
      )}

      {/* Action needed documents */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t("actionNeeded")}</h3>
        {actionDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActionDocs")}</p>
        ) : (
          <ul className="space-y-2">
            {actionDocs.map((doc) => (
              <ActionDocItem key={doc.index} onboardingId={onboarding._id} doc={doc} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>

      {/* Shared documents */}
      {sharedDocs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{t("sharedWithYou")}</h3>
          <ul className="space-y-2">
            {sharedDocs.map((doc) => (
              <li key={doc.index} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">{doc.name}</span>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="rounded-xl">
                      <Download className="mr-2 h-4 w-4" />
                      {t("download")}
                    </Button>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionDocItem({
  onboardingId, doc, onChanged,
}: { onboardingId: string; doc: OnboardingDoc; onChanged: () => void }) {
  const t = useTranslations("jobSeekerOnboarding");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState("");

  const isSigned = doc.status === "signed";
  const isSubmitted = doc.status === "submitted" || doc.status === "signed" || doc.status === "approved";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentIndex", String(doc.index));
      const res = await csrfFetch(`/api/job-seeker/onboarding/${onboardingId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("uploadFailed"));
        return;
      }
      toast.success(t("uploadSuccess"));
      onChanged();
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitSign() {
    if (signName.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/job-seeker/onboarding/${onboardingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIndex: doc.index, signatureName: signName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("signFailed"));
        return;
      }
      toast.success(t("signSuccess"));
      setSignOpen(false);
      setSignName("");
      onChanged();
    } catch {
      toast.error(t("signFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/50 px-3 py-3 sm:flex-row sm:items-center">
      <FileText className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{doc.name}</span>
          {doc.status && (
            <Badge variant="outline" className={DOC_STATUS_STYLES[doc.status]}>
              {t(`docStatus_${doc.status}`)}
            </Badge>
          )}
          {doc.requiresSignature && !isSigned && (
            <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-700">
              {t("requiresSignature")}
            </Badge>
          )}
        </div>
        {doc.dueDate && (
          <p className="text-xs text-muted-foreground">{t("dueDate", { date: formatDate(doc.dueDate) })}</p>
        )}
        {doc.signature && (
          <p className="text-xs text-emerald-600">
            {t("signedBy", { name: doc.signature.fullName, date: formatDate(doc.signature.signedAt) })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="rounded-xl">
              <FileText className="mr-2 h-4 w-4" />
              {t("view")}
            </Button>
          </a>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
          onChange={handleFile}
        />
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {isSubmitted ? t("reupload") : t("upload")}
        </Button>
        {doc.requiresSignature && !isSigned && (
          <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => setSignOpen(true)}>
            <PenLine className="mr-2 h-4 w-4" />
            {t("sign")}
          </Button>
        )}
      </div>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("signTitle")}</DialogTitle>
            <DialogDescription>{t("signDescription", { document: doc.name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`sign-${doc.index}`}>{t("signNameLabel")}</Label>
            <Input
              id={`sign-${doc.index}`}
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder={t("signNamePlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setSignOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button className="rounded-xl" onClick={submitSign} disabled={busy || signName.trim().length < 2}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
              {t("signConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
