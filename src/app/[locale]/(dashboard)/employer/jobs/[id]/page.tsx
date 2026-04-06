"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Edit2, Copy, CheckCircle, XCircle, Clock, MapPin,
  Briefcase, DollarSign, Users, Eye, Calendar, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";

interface Job {
  _id: string;
  title: string;
  description: string;
  category?: string;
  location?: { country?: string; city?: string; isRemote?: boolean } | string;
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
    languages?: string[];
  };
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean };
  status: string;
  workflowMode?: string;
  vacancies?: number;
  views?: number;
  tags?: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  employerId?: { companyName?: string };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  closed: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-700 border-red-200",
  pending_approval: "bg-blue-100 text-blue-700 border-blue-200",
};

export default function JobDetailPage() {
  const router = useRouter();
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { can } = usePermissions();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job);
          document.title = `${data.job.title} · MPLOYEDIN`;
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function updateStatus(status: string) {
    const res = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setJob(data.job);
    }
  }

  async function cloneJob() {
    setCloning(true);
    try {
      const res = await fetch(`/api/jobs/${id}/clone`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        router.push(`/${locale}/employer/jobs/${data.job._id}/edit`);
      }
    } finally {
      setCloning(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="card-base h-64 animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-container text-center py-20">
        <h2 className="text-lg font-semibold mb-2">Job not found</h2>
        <Button variant="outline" onClick={() => router.push(`/${locale}/employer/jobs`)}>
          <ArrowLeft className="w-4 h-4 me-2" /> Back to Jobs
        </Button>
      </div>
    );
  }

  const loc = typeof job.location === "string"
    ? job.location
    : job.location
      ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}${job.location.isRemote ? " (Remote)" : ""}`
      : null;

  const posted = new Date(job.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const expires = job.expiresAt
    ? new Date(job.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="page-container">
      {/* Back + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/employer/jobs`)}>
          <ArrowLeft className="w-4 h-4 me-2" /> Back to Jobs
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={cloneJob} disabled={cloning}>
            <Copy className="w-4 h-4 me-1.5" /> {cloning ? "Cloning…" : "Clone"}
          </Button>
          {can("jobs", "update") && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/${locale}/employer/jobs/${id}/edit`)}>
              <Edit2 className="w-4 h-4 me-1.5" /> Edit
            </Button>
          )}
          {can("jobs", "update") && job.status === "draft" && (
            <Button size="sm" onClick={() => updateStatus("active")}>
              <CheckCircle className="w-4 h-4 me-1.5" /> Activate
            </Button>
          )}
          {can("jobs", "update") && job.status === "active" && (
            <Button size="sm" variant="destructive" onClick={() => updateStatus("closed")}>
              <XCircle className="w-4 h-4 me-1.5" /> Close
            </Button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="card-base mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold mb-2">{job.title}</h1>
            <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
              {loc && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {loc}
                </span>
              )}
              {job.category && (
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" /> {job.category}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Posted {posted}
              </span>
            </div>
          </div>
          <Badge className={STATUS_COLORS[job.status] ?? ""}>
            {job.status.replace("_", " ")}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-lg font-semibold">{job.vacancies ?? 1}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Users className="w-3 h-3" /> Vacancies
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{job.views ?? 0}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Eye className="w-3 h-3" /> Views
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">
              {job.salary?.min && job.salary?.max
                ? `${job.salary.min.toLocaleString()}–${job.salary.max.toLocaleString()}`
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" /> {job.salary?.currency ?? "USD"}
              {job.salary?.isNegotiable && " (Negotiable)"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold">{expires ?? "No expiry"}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Expires
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="card-base mb-6">
        <h2 className="text-sm font-semibold mb-3">Job Description</h2>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-muted-foreground">
          {job.description}
        </div>
      </div>

      {/* Requirements */}
      {job.requirements && (
        <div className="card-base mb-6">
          <h2 className="text-sm font-semibold mb-3">Requirements</h2>

          {job.requirements.skills && job.requirements.skills.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {job.requirements.skills.map((s) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {(job.requirements.experienceMin !== undefined || job.requirements.experienceMax !== undefined) && (
              <div>
                <span className="text-xs text-muted-foreground block">Experience</span>
                <span className="font-medium">
                  {job.requirements.experienceMin ?? 0}–{job.requirements.experienceMax ?? 30} years
                </span>
              </div>
            )}
            {job.requirements.education && (
              <div>
                <span className="text-xs text-muted-foreground block">Education</span>
                <span className="font-medium">{job.requirements.education}</span>
              </div>
            )}
            {job.requirements.languages && job.requirements.languages.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground block">Languages</span>
                <span className="font-medium">{job.requirements.languages.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {job.tags && job.tags.length > 0 && (
        <div className="card-base">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Tags
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {job.tags.map((t) => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
