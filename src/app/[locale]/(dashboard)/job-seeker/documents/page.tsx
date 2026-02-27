"use client";

import { useState, useRef, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Upload, FileText, CheckCircle, Loader2, Sparkles, X } from "lucide-react";

interface ExtractedData {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  skills?: string[];
  experience?: { company: string; role: string; duration: string }[];
  education?: { institution: string; degree: string; year: string }[];
  languages?: string[];
  summary?: string;
}

export default function JobSeekerDocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.type === "application/pdf" || dropped.type.includes("word"))) {
      setFile(dropped);
      setError("");
    } else {
      setError("Only PDF and Word documents are supported");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError("");
    }
  };

  const extractCV = async () => {
    if (!file) return;
    setExtracting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/cv-extract", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExtracted(data.extracted ?? data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const saveToProfile = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: extracted.skills,
          languages: extracted.languages,
          experience: extracted.experience,
          education: extracted.education,
          bio: extracted.summary,
        }),
      });
      if (res.ok) setSaved(true);
      else setError("Failed to save. Please try manually.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="CV & Documents"
        description="Upload your CV and let AI extract your profile information automatically"
      />

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div className="text-left">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setExtracted(null); setSaved(false); }}
              className="ml-2 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">Drag & drop your CV here</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX up to 10MB</p>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
      )}

      {file && !extracted && (
        <button
          onClick={extractCV}
          disabled={extracting}
          className="btn-primary w-full py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {extracting ? "Extracting with AI…" : "Extract Profile with AI"}
        </button>
      )}

      {/* Extracted preview */}
      {extracted && (
        <div className="card-base space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold">Extracted Profile</h3>
          </div>

          {extracted.name && <p className="text-sm"><strong>Name:</strong> {extracted.name}</p>}
          {extracted.email && <p className="text-sm"><strong>Email:</strong> {extracted.email}</p>}
          {extracted.location && <p className="text-sm"><strong>Location:</strong> {extracted.location}</p>}

          {extracted.skills && extracted.skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {extracted.skills.map((s) => (
                  <span key={s} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}

          {extracted.experience && extracted.experience.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Experience</p>
              <div className="space-y-1.5">
                {extracted.experience.map((exp, i) => (
                  <div key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                    <p className="font-medium">{exp.role} — {exp.company}</p>
                    <p className="text-xs text-muted-foreground">{exp.duration}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {extracted.education && extracted.education.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Education</p>
              <div className="space-y-1.5">
                {extracted.education.map((ed, i) => (
                  <div key={i} className="text-sm border-l-2 border-blue-200 pl-3">
                    <p className="font-medium">{ed.degree}</p>
                    <p className="text-xs text-muted-foreground">{ed.institution} · {ed.year}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {saved ? (
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <CheckCircle className="h-4 w-4" /> Profile updated successfully!
            </div>
          ) : (
            <button
              onClick={saveToProfile}
              disabled={saving}
              className="w-full py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving ? "Saving…" : "Save to Profile"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
