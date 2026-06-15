"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
  RotateCcw,
  ThumbsUp,
  Trash2,
  Upload,
  Video,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────
interface ApplicationDetail {
  _id: string;
  status: string;
  aiMatchScore?: number;
  appliedAt: string;
  coverLetter?: string;
  documents?: { name: string; url: string; type: string }[];
  statusHistory: { status: string; changedAt: string; note?: string }[];
  jobId: {
    _id: string;
    title: string;
    location?: { city?: string; country?: string; isRemote?: boolean };
    salary?: { min: number; max: number; currency: string };
    employerId?: { _id: string; companyName?: string; logo?: string };
  };
  interviews: InterviewItem[];
  offers: OfferItem[];
}

interface InterviewItem {
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

interface OfferItem {
  _id: string;
  salary?: { amount: number; currency: string; period: string };
  startDate?: string;
  benefits?: string;
  status: string;
  expiresAt?: string;
}

const DOC_TYPES = [
  { value: "resume", label: "Resume / CV" },
  { value: "cover_letter", label: "Cover Letter" },
  { value: "portfolio", label: "Portfolio" },
  { value: "certification", label: "Certification" },
  { value: "reference", label: "Reference Letter" },
  { value: "id_document", label: "ID Document" },
  { value: "other", label: "Other" },
];

// ── Main Page ──────────────────────────────────────────────────────
export default function ApplicationDetailPage() {
  const { id, locale } = useParams<{ id: string; locale: string }>();
  const router = useRouter();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchApplication = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${id}?include=interviews,offers,documents`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setApp(data.application ?? data);
    } catch {
      setError("Could not load application details.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  useEffect(() => {
    document.title = "Application Details · MPLOYEDIN";
  }, []);

  if (loading) {
    return (
      <div className="page-container max-w-3xl">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-base h-24 animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="page-container max-w-3xl text-center py-16">
        <p className="text-muted-foreground">{error || "Application not found"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const job = app.jobId;
  const employer = typeof job?.employerId === "object" ? job.employerId : null;
  const isActive = !["rejected", "withdrawn", "hired"].includes(app.status);

  return (
    <div className="page-container max-w-3xl gap-4 pt-3 md:pt-4">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
        onClick={() => router.push(`/${locale}/job-seeker/applications`)}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Applications
      </Button>

      {/* ── Header Card ─────────────────────────────────────────── */}
      <section className="card-base rounded-2xl border p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-xl border bg-muted/20 flex items-center justify-center shrink-0">
            {employer?.logo ? (
              <img src={employer.logo} alt={employer.companyName ?? ""} className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{job?.title ?? "Position"}</h1>
            <p className="text-sm text-muted-foreground">{employer?.companyName ?? "Company"}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Applied {new Date(app.appliedAt).toLocaleDateString()}
          </span>
          {(() => {
            const loc = job?.location?.isRemote
              ? "Remote"
              : [job?.location?.city, job?.location?.country].filter(Boolean).join(", ");
            return loc ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {loc}
              </span>
            ) : null;
          })()}
          {job?.salary && (job.salary.min || job.salary.max) && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true">💰</span>
              {job.salary.min && job.salary.max
                ? `${job.salary.currency ?? "AED"} ${job.salary.min.toLocaleString()} – ${job.salary.max.toLocaleString()}`
                : `From ${job.salary.currency ?? "AED"} ${(job.salary.min || job.salary.max).toLocaleString()}`}
            </span>
          )}
          {app.aiMatchScore != null && app.aiMatchScore > 0 && (
            <span className={cn(
              "font-medium",
              app.aiMatchScore >= 70 ? "text-emerald-600" : app.aiMatchScore >= 50 ? "text-amber-600" : "text-muted-foreground"
            )}>
              {app.aiMatchScore}% match
            </span>
          )}
        </div>

        {job?._id && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(`/${locale}/job-seeker/jobs/${job._id}`)}
          >
            <ExternalLink className="h-3.5 w-3.5" /> View job posting
          </Button>
        )}

        {/* Status Timeline */}
        {app.statusHistory?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
            {app.statusHistory.map((h, i) => (
              <span key={`${h.status}-${h.changedAt}`} className="flex items-center gap-1 text-xs">
                {i > 0 && <span className="text-muted-foreground/60">→</span>}
                <StatusBadge status={h.status} size="sm" />
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Interviews Section ──────────────────────────────────── */}
      {app.interviews?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Video className="h-4 w-4" /> Interviews ({app.interviews.length})
          </h2>
          {app.interviews.map((iv) => (
            <InterviewActionCard key={iv._id} interview={iv} onUpdated={fetchApplication} />
          ))}
        </section>
      )}

      {/* ── Offers Section ──────────────────────────────────────── */}
      {app.offers?.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ThumbsUp className="h-4 w-4" /> Offers ({app.offers.length})
          </h2>
          {app.offers.map((offer) => (
            <OfferActionCard key={offer._id} offer={offer} onUpdated={fetchApplication} />
          ))}
        </section>
      )}

      {/* ── Documents Section ───────────────────────────────────── */}
      <DocumentsSection
        applicationId={app._id}
        documents={app.documents ?? []}
        isActive={isActive}
        onUpdated={fetchApplication}
      />
    </div>
  );
}

// ── Interview Action Card ──────────────────────────────────────────
function InterviewActionCard({ interview: iv, onUpdated }: { interview: InterviewItem; onUpdated: () => void }) {
  const [responding, setResponding] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleNote, setRescheduleNote] = useState("");

  const upcoming = new Date(iv.scheduledAt) >= new Date();
  const canRespond = upcoming && (!iv.candidateResponse || iv.candidateResponse === "pending") &&
    ["scheduled", "rescheduled"].includes(iv.status);

  async function handleRespond(response: "confirmed" | "declined" | "reschedule_requested") {
    setResponding(true);
    try {
      const res = await fetch(`/api/interviews/${iv._id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          ...(response === "reschedule_requested" && { rescheduleNote: rescheduleNote.trim() }),
        }),
      });
      if (res.ok) {
        onUpdated();
        setShowReschedule(false);
      }
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="card-base rounded-xl border p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize text-xs">
            {iv.type === "video" ? <Video className="h-3 w-3 mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
            {iv.type} · Round {iv.interviewRound}
          </Badge>
          <StatusBadge status={iv.status} size="sm" />
        </div>
        {iv.candidateResponse && iv.candidateResponse !== "pending" && (
          <Badge variant="outline" className={cn(
            "text-xs",
            iv.candidateResponse === "confirmed" && "bg-emerald-50 text-emerald-700 border-emerald-200",
            iv.candidateResponse === "declined" && "bg-red-50 text-red-700 border-red-200",
            iv.candidateResponse === "reschedule_requested" && "bg-amber-50 text-amber-700 border-amber-200",
          )}>
            {iv.candidateResponse === "confirmed" ? "Confirmed" : iv.candidateResponse === "declined" ? "Declined" : "Reschedule Requested"}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(iv.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(iv.scheduledAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · {iv.duration}min
        </span>
        {iv.meetLink && (
          <a href={iv.meetLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Join Meeting
          </a>
        )}
        {iv.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{iv.location}</span>}
      </div>

      {iv.instructions && (
        <p className="text-xs italic text-muted-foreground">{iv.instructions}</p>
      )}

      {iv.outcome && (
        <div className="text-xs">
          Outcome: <span className="font-medium capitalize">{iv.outcome.replace("_", " ")}</span>
        </div>
      )}

      {/* Action Buttons */}
      {canRespond && !showReschedule && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => handleRespond("confirmed")}
            disabled={responding}
          >
            {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => setShowReschedule(true)}
            disabled={responding}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reschedule
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 text-destructive hover:text-destructive"
            onClick={() => handleRespond("declined")}
            disabled={responding}
          >
            <X className="h-3.5 w-3.5" /> Decline
          </Button>
        </div>
      )}

      {/* Reschedule Form */}
      {showReschedule && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea
            placeholder="Please explain why you need to reschedule..."
            value={rescheduleNote}
            onChange={(e) => setRescheduleNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleRespond("reschedule_requested")}
              disabled={!rescheduleNote.trim() || responding}
            >
              {responding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Request Reschedule
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowReschedule(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Offer Action Card ──────────────────────────────────────────────
function OfferActionCard({ offer, onUpdated }: { offer: OfferItem; onUpdated: () => void }) {
  const [responding, setResponding] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const isPending = offer.status === "pending";
  const isExpired = offer.expiresAt && new Date(offer.expiresAt) < new Date();

  async function handleRespond(status: "accepted" | "declined") {
    setResponding(true);
    try {
      const res = await fetch(`/api/offers/${offer._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(status === "declined" && declineReason && { declineReason }),
        }),
      });
      if (res.ok) {
        onUpdated();
        setShowDeclineForm(false);
      }
    } finally {
      setResponding(false);
    }
  }

  return (
    <div className="card-base rounded-xl border border-emerald-200/70 bg-emerald-50/30 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-emerald-800">Offer</span>
        <Badge variant="outline" className={cn(
          "text-xs",
          offer.status === "pending" && "bg-amber-50 text-amber-700 border-amber-200",
          offer.status === "accepted" && "bg-emerald-50 text-emerald-700 border-emerald-200",
          offer.status === "declined" && "bg-red-50 text-red-700 border-red-200",
          offer.status === "expired" && "bg-gray-50 text-gray-600 border-gray-200",
        )}>
          {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {offer.salary && (
          <span className="font-medium text-foreground">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: offer.salary.currency, maximumFractionDigits: 0 }).format(offer.salary.amount)} / {offer.salary.period}
          </span>
        )}
        {offer.startDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Start: {new Date(offer.startDate).toLocaleDateString()}
          </span>
        )}
        {offer.expiresAt && isPending && (
          <span className={cn("text-[11px]", isExpired ? "text-red-600" : "text-amber-600")}>
            {isExpired ? "Expired" : `Expires: ${new Date(offer.expiresAt).toLocaleDateString()}`}
          </span>
        )}
      </div>

      {offer.benefits && (
        <p className="text-xs text-muted-foreground">{offer.benefits}</p>
      )}

      {/* Offer Actions */}
      {isPending && !isExpired && !showDeclineForm && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => handleRespond("accepted")}
            disabled={responding}
          >
            {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Accept Offer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-red-600 hover:text-red-700 border-red-200"
            onClick={() => setShowDeclineForm(true)}
            disabled={responding}
          >
            <XCircle className="h-3.5 w-3.5" /> Decline
          </Button>
        </div>
      )}

      {showDeclineForm && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea
            placeholder="Reason for declining (optional)..."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            maxLength={500}
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8"
              onClick={() => handleRespond("declined")}
              disabled={responding}
            >
              {responding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Confirm Decline
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowDeclineForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Documents Section ──────────────────────────────────────────────
function DocumentsSection({
  applicationId,
  documents,
  isActive,
  onUpdated,
}: {
  applicationId: string;
  documents: { name: string; url: string; type: string }[];
  isActive: boolean;
  onUpdated: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleAdd() {
    if (!docName.trim() || !docUrl.trim()) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: docName.trim(), url: docUrl.trim(), type: docType }),
      });
      if (res.ok) {
        setDocName("");
        setDocUrl("");
        setDocType("other");
        setShowUpload(false);
        onUpdated();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    setDeleting(url);
    try {
      await fetch(`/api/applications/${applicationId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      onUpdated();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Documents ({documents.length})
        </h2>
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Plus className="h-3.5 w-3.5" /> Add Document
          </Button>
        )}
      </div>

      {/* Document List */}
      {documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <div
              key={`${doc.url}-${i}`}
              className="card-base rounded-xl border p-3 flex items-center gap-3"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/applications/${applicationId}/documents/download?i=${i}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline truncate block"
                >
                  {doc.name}
                </a>
                <span className="text-[11px] text-muted-foreground capitalize">{doc.type.replace("_", " ")}</span>
              </div>
              {isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(doc.url)}
                  disabled={deleting === doc.url}
                >
                  {deleting === doc.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card-base rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
          No documents attached. Add supporting documents to strengthen your application.
        </div>
      )}

      {/* Add Document Form */}
      {showUpload && (
        <div className="card-base rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-medium">Add Document</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Document Name</label>
              <Input
                placeholder="e.g. Software Engineering Certificate"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="h-9 text-sm"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Document URL</label>
            <Input
              placeholder="https://drive.google.com/..."
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              className="h-9 text-sm"
              type="url"
            />
            <p className="text-[11px] text-muted-foreground">
              Upload your file to Google Drive, Dropbox, or any cloud storage and paste the sharing link here.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleAdd}
              disabled={!docName.trim() || !docUrl.trim() || uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Add Document
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
