"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Upload, FileText, CheckCircle, Loader2, Sparkles, X,
  Award, GraduationCap, BookOpen, FolderOpen, Trash2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";

/* ── Document Categories ── */

const DOC_CATEGORIES = [
  { value: "resume", label: "Resume / CV", icon: FileText, color: "bg-primary/10 text-primary" },
  { value: "college_certificate", label: "College Certificate", icon: GraduationCap, color: "bg-blue-50 text-blue-700" },
  { value: "course_certificate", label: "Course Certificate", icon: BookOpen, color: "bg-purple-50 text-purple-700" },
  { value: "professional_certificate", label: "Professional Certificate", icon: Award, color: "bg-amber-50 text-amber-700" },
  { value: "other", label: "Other Document", icon: FolderOpen, color: "bg-gray-50 text-gray-700" },
] as const;

type DocCategory = typeof DOC_CATEGORIES[number]["value"];

/* ── Types ── */

interface UploadedDocument {
  id: string;
  name: string;
  category: DocCategory;
  url: string;
  size: number;
  uploadedAt: string;
}

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

interface ExtractedEducation {
  degree: string;
  field: string;
  institution: string;
  country: string;
  from: string;
  to: string;
  grade: string;
}

interface ExtractedLanguage {
  language: string;
  level: string;
}

interface ExtractedData {
  fullName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  currentLocation?: string;
  headline?: string;
  skills?: ExtractedSkill[];
  experience?: ExtractedExperience[];
  education?: ExtractedEducation[];
  languages?: ExtractedLanguage[];
  certifications?: string[];
  linkedin?: string;
  portfolio?: string;
}

export default function JobSeekerDocumentsPage() {
  const t = useTranslations("jobSeekerExtra.documents");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocCategory>("resume");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  useEffect(() => {
    document.title = t("documentTitle");
    fetchDocuments();
  }, [t]);

  async function fetchDocuments() {
    try {
      const res = await fetch("/api/job-seeker/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingDocs(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && ALLOWED_TYPES.includes(dropped.type)) {
      setFile(dropped);
    } else {
      toast.error(t("supportedFormats"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!ALLOWED_TYPES.includes(selected.type)) {
        toast.error(t("supportedFormats"));
        return;
      }
      setFile(selected);
    }
  };

  /* Upload document to storage + save metadata */
  const uploadDocument = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      // If it's a resume, also upload via the CV endpoint so cv.originalUrl gets set
      if (category === "resume") {
        const cvFormData = new FormData();
        cvFormData.append("cv", file);
        const cvRes = await fetch("/api/job-seeker/cv", {
          method: "POST",
          body: cvFormData,
        });
        if (!cvRes.ok) {
          const err = await cvRes.json().catch(() => null);
          throw new Error(err?.error ?? t("uploadFailed"));
        }
      }

      // Save document metadata
      const res = await fetch("/api/job-seeker/documents", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setDocuments((prev) => [data.document ?? { id: Date.now().toString(), name: file.name, category, url: "", size: file.size, uploadedAt: new Date().toISOString() }, ...prev]);
        toast.success(t("uploaded", { category: getCategoryLabel(category) }));
        setFile(null);
        setExtracted(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        // If the documents API doesn't exist yet, still count the CV upload as success
        if (category === "resume") {
          setDocuments((prev) => [{ id: Date.now().toString(), name: file.name, category, url: "", size: file.size, uploadedAt: new Date().toISOString() }, ...prev]);
          toast.success(t("resumeUploaded"));
          setFile(null);
          setExtracted(null);
          if (inputRef.current) inputRef.current.value = "";
        } else {
          toast.error(t("uploadFailed"));
        }
      }
    } catch (e) {
      toast.error(t("uploadGenericFailed"));
    } finally {
      setUploading(false);
    }
  };

  const extractCV = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await csrfFetch("/api/ai/cv-extract", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? t("extractionFailed"));
      }
      const data = await res.json();
      setExtracted(data.extracted ?? data);
      toast.success(t("extractedSuccess"));
    } catch (e) {
      toast.error(t("extractionFailed"));
    } finally {
      setExtracting(false);
    }
  };

  const saveToProfile = async () => {
    if (!extracted) return;
    setSaving(true);
    try {
      // Also upload the file as CV if not already done
      if (file) {
        const cvFormData = new FormData();
        cvFormData.append("cv", file);
        await fetch("/api/job-seeker/cv", { method: "POST", body: cvFormData }).catch(() => {});
      }

      const skillNames = extracted.skills?.map((s) => s.name).filter(Boolean) ?? [];
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: extracted.headline,
          skills: skillNames,
          certifications: extracted.certifications,
          languages: extracted.languages?.map((l) => ({
            language: l.language,
            proficiency: l.level === "native" ? "native"
              : l.level === "fluent" ? "professional"
              : l.level === "intermediate" ? "conversational"
              : "basic",
          })),
          experience: extracted.experience?.map((e) => ({
            jobTitle: e.jobTitle,
            company: e.company,
            country: e.location,
            startDate: e.from,
            endDate: e.to !== "present" ? e.to : undefined,
            isCurrent: e.current || e.to === "present",
            description: e.description,
          })),
          education: extracted.education?.map((e) => ({
            degree: e.degree,
            institution: e.institution,
            field: e.field,
            graduationDate: e.to,
            grade: e.grade,
          })),
        }),
      });
      if (res.ok) {
        toast.success(t("profileUpdated"));
      } else {
        toast.error(t("saveFailed"));
      }
    } catch {
      toast.error(t("saveProfileFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteDocument = async (doc: UploadedDocument) => {
    try {
      const res = await fetch(`/api/job-seeker/documents?id=${doc.id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        toast.success(t("removed"));
      }
    } catch {
      toast.error(t("removeFailed"));
    }
  };

  function getCategoryLabel(cat: DocCategory) {
    return t(`categories.${cat}`) ?? t("documentFallback");
  }

  function getCategoryConfig(cat: DocCategory) {
    return DOC_CATEGORIES.find((c) => c.value === cat) ?? DOC_CATEGORIES[4];
  }

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="space-y-3 sm:space-y-6">
        {/* ── Category selector ── */}
        <div className="card-base panel-body">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("type")}</p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {DOC_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = category === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {getCategoryLabel(cat.value)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Upload area ── */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-4 sm:p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="text-start">
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {getCategoryLabel(category)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setExtracted(null); }}
                className="ms-2 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">{t("uploadPrompt", { category: getCategoryLabel(category).toLowerCase() })}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("formats")}</p>
            </>
          )}
        </div>

        {/* Action buttons */}
        {file && (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={uploadDocument}
              disabled={uploading}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? t("uploading") : t("uploadDocument")}
            </button>
            {category === "resume" && !extracted && (
              <button
                onClick={extractCV}
                disabled={extracting}
                className="flex-1 py-2.5 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary/5 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {extracting ? t("extracting") : t("extractWithAi")}
              </button>
            )}
          </div>
        )}

        {/* Extracted preview */}
        {extracted && (
          <div className="card-base space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold">{t("extractedProfile")}</h3>
            </div>

            {extracted.fullName && <p className="text-sm"><strong>Name:</strong> {extracted.fullName}</p>}
            {extracted.email && <p className="text-sm"><strong>Email:</strong> {extracted.email}</p>}
            {extracted.currentLocation && <p className="text-sm"><strong>Location:</strong> {extracted.currentLocation}</p>}
            {extracted.headline && <p className="text-sm"><strong>Headline:</strong> {extracted.headline}</p>}

            {extracted.skills && extracted.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {extracted.skills.map((s, i) => (
                    <span key={`${s.name}-${i}`} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{s.name}</span>
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
                      <p className="font-medium">{exp.jobTitle} — {exp.company}</p>
                      <p className="text-xs text-muted-foreground">{exp.from} – {exp.current ? t("present") : exp.to}</p>
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
                      <p className="font-medium">{ed.degree}{ed.field ? ` in ${ed.field}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{ed.institution} · {ed.country}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extracted.certifications && extracted.certifications.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Certifications</p>
                <div className="flex flex-wrap gap-1.5">
                  {extracted.certifications.map((cert, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">{cert}</span>
                  ))}
                </div>
              </div>
            )}

            {extracted.languages && extracted.languages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Languages</p>
                <div className="flex flex-wrap gap-1.5">
                  {extracted.languages.map((l, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium capitalize">
                      {l.language} · {l.level}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={saveToProfile}
              disabled={saving}
              className="w-full py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving ? t("saving") : t("saveToProfile")}
            </button>
          </div>
        )}

        {/* ── Uploaded Documents List ── */}
        <div className="card-base">
          <div className="flex items-center justify-between gap-4 p-4 border-b flex-col sm:flex-row">
            <h3 className="font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              {t("myDocuments")}
              {documents.length > 0 && (
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{documents.length.toLocaleString(numberLocale)}</span>
              )}
            </h3>
            {documents.length > 0 && (
              <div className="w-full sm:w-56">
                <input
                  type="text"
                  placeholder={t("searchPlaceholder") ?? "Search documents..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>

          {loadingDocs ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t("empty")}</p>
              <p className="text-xs mt-1">{t("emptyDescription")}</p>
            </div>
          ) : (
            <div className="divide-y">
              {documents.filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase())).map((doc) => {
                const catConfig = getCategoryConfig(doc.category);
                const CatIcon = catConfig.icon;
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${catConfig.color}`}>
                      <CatIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getCategoryLabel(doc.category)} · {(doc.size / 1024).toFixed(0)} KB
                        {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString(numberLocale)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {doc.url && (
                        <a
                          href={`/api/job-seeker/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title={t("view")}
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => deleteDocument(doc)}
                        className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                        title={t("remove")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
