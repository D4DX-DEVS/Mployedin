"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload, FileText, CheckCircle, AlertCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

interface ExtractedSkill {
  name: string;
  level: string;
  yearsOfExperience: number;
}

interface ExtractedExperience {
  jobTitle: string;
  company: string;
  location: string;
  from: string;
  to: string;
  current: boolean;
  description: string;
}

interface ExtractedData {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  currentLocation: string;
  headline: string;
  skills: ExtractedSkill[];
  experience: ExtractedExperience[];
  education: Array<{ degree: string; field: string; institution: string; country: string }>;
  languages: Array<{ language: string; level: string }>;
  certifications: string[];
  linkedin: string;
  portfolio: string;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export default function CVUploadPage() {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [profileCompleteness, setProfileCompleteness] = useState(0);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    document.title = "Upload CV · MPLOYEDIN";
  }, []);

  function handleFileSelect(f: File) {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) {
      setError("Please upload a PDF or image file (JPG, PNG, WEBP)");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File size must be under 10 MB");
      return;
    }
    setError("");
    setFile(f);
    setExtracted(null);
    setUploadState("idle");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploadState("uploading");
    setProgress(10);

    // Simulate progress ticks
    const tick = setInterval(() => setProgress((p) => Math.min(p + 8, 85)), 500);

    try {
      const formData = new FormData();
      formData.append("cv", file);

      const res = await fetch("/api/ai/cv-extract", {
        method: "POST",
        body: formData,
      });

      clearInterval(tick);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const data = await res.json();
      setExtracted(data.extracted);
      setProfileCompleteness(data.profileCompleteness);
      setUploadState("success");
    } catch (e) {
      clearInterval(tick);
      setError(e instanceof Error ? e.message : "Something went wrong");
      setUploadState("error");
      setProgress(0);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Upload Your CV"
        description="Let AI extract your profile data automatically from your CV or resume"
        actions={
          extracted && (
            <Button onClick={() => router.push("./profile")} size="sm">
              View Profile →
            </Button>
          )
        }
      />

      {/* Drop Zone */}
      {uploadState !== "success" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
            ${isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
          <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            Drag & drop your CV here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, JPG, PNG, WEBP · Max 10 MB
          </p>
        </div>
      )}

      {/* Selected file info */}
      {file && uploadState !== "success" && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setFile(null); setError(""); }}
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); handleUpload(); }}
            disabled={uploadState === "uploading"}
            size="sm"
          >
            <Sparkles className="w-4 h-4 me-2" />
            {uploadState === "uploading" ? "Extracting…" : "Extract with AI"}
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {uploadState === "uploading" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Gemini AI is reading your CV…</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Success — show extracted data */}
      {uploadState === "success" && extracted && (
        <div className="space-y-6">
          {/* Completeness banner */}
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
            <CheckCircle className="w-8 h-8 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">CV extracted successfully!</p>
              <p className="text-sm text-emerald-600">Profile completeness updated to {profileCompleteness}%</p>
            </div>
            <Progress value={profileCompleteness} className="w-32 h-2" />
          </div>

          {/* Extracted summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {extracted.fullName && (
              <InfoCard label="Name" value={extracted.fullName} />
            )}
            {extracted.email && (
              <InfoCard label="Email" value={extracted.email} />
            )}
            {extracted.phone && (
              <InfoCard label="Phone" value={extracted.phone} />
            )}
            {extracted.nationality && (
              <InfoCard label="Nationality" value={extracted.nationality} />
            )}
            {extracted.currentLocation && (
              <InfoCard label="Location" value={extracted.currentLocation} />
            )}
            {extracted.headline && (
              <InfoCard label="Headline" value={extracted.headline} className="md:col-span-2" />
            )}
          </div>

          {/* Skills */}
          {extracted.skills?.length > 0 && (
            <Section title={`Skills (${extracted.skills.length})`}>
              <div className="flex flex-wrap gap-2">
                {extracted.skills.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {s.name} {s.yearsOfExperience > 0 && `· ${s.yearsOfExperience}y`}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {/* Experience */}
          {extracted.experience?.length > 0 && (
            <Section title={`Experience (${extracted.experience.length})`}>
              <div className="space-y-3">
                {extracted.experience.map((exp, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{exp.jobTitle}</p>
                        <p className="text-xs text-muted-foreground">{exp.company} · {exp.location}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {exp.from} – {exp.current ? "Present" : exp.to}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{exp.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Education */}
          {extracted.education?.length > 0 && (
            <Section title={`Education (${extracted.education.length})`}>
              <div className="space-y-2">
                {extracted.education.map((edu, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">{edu.degree} in {edu.field}</p>
                      <p className="text-xs text-muted-foreground">{edu.institution} · {edu.country}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Languages */}
          {extracted.languages?.length > 0 && (
            <Section title="Languages">
              <div className="flex flex-wrap gap-2">
                {extracted.languages.map((l, i) => (
                  <Badge key={i} variant="outline" className="text-xs capitalize">
                    {l.language} · {l.level}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => router.push("./profile")}>
              View & Edit Profile
            </Button>
            <Button
              variant="outline"
              onClick={() => { setFile(null); setExtracted(null); setUploadState("idle"); setProgress(0); }}
            >
              Upload Another CV
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`p-3 rounded-lg border bg-muted/20 ${className}`}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-base space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
