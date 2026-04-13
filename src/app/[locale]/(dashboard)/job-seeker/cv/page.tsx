"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, CheckCircle, AlertCircle, Sparkles,
  X, Plus, Pencil, Save, Download, ArrowRight, Loader2,
  Trash2, Eye, Briefcase, GraduationCap,
  Globe, Award, User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";

/* ── Types ── */

interface WorkExperience {
  jobTitle: string;
  company: string;
  country: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
}

interface Education {
  degree: string;
  institution: string;
  field: string;
  graduationDate: string;
  grade: string;
}

interface LanguageSkill {
  language: string;
  proficiency: "basic" | "conversational" | "professional" | "native";
}

interface CVForm {
  fullName: string;
  email: string;
  phone: string;
  nationality: string;
  currentLocation: string;
  headline: string;
  linkedin: string;
  portfolio: string;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  languages: LanguageSkill[];
  certifications: string[];
}

type Step = "edit" | "preview" | "download";

const EMPTY_EXPERIENCE: WorkExperience = {
  jobTitle: "", company: "", country: "", startDate: "", endDate: "", isCurrent: false, description: "",
};
const EMPTY_EDUCATION: Education = {
  degree: "", institution: "", field: "", graduationDate: "", grade: "",
};
const EMPTY_LANGUAGE: LanguageSkill = { language: "", proficiency: "conversational" };

const PROFICIENCY_OPTIONS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "professional", label: "Professional" },
  { value: "native", label: "Native" },
];

export default function CVBuilderPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [certInput, setCertInput] = useState("");

  const [form, setForm] = useState<CVForm>({
    fullName: "", email: "", phone: "", nationality: "", currentLocation: "",
    headline: "", linkedin: "", portfolio: "",
    skills: [], experience: [], education: [], languages: [], certifications: [],
  });

  useEffect(() => {
    document.title = "CV Builder · MPLOYEDIN";
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/job-seeker/profile");
      if (res.ok && res.status !== 204) {
        const profile = await res.json();
        setForm((prev) => ({
          ...prev,
          phone: profile.phone ?? prev.phone,
          nationality: profile.nationality ?? prev.nationality,
          currentLocation: profile.currentLocation ?? prev.currentLocation,
          headline: profile.summary ?? prev.headline,
          linkedin: profile.linkedin ?? prev.linkedin,
          portfolio: profile.portfolio ?? prev.portfolio,
          skills: profile.skills?.length ? profile.skills : prev.skills,
          experience: profile.experience?.length
            ? profile.experience.map((e: Record<string, unknown>) => ({
                jobTitle: (e.jobTitle as string) ?? "",
                company: (e.company as string) ?? "",
                country: (e.country as string) ?? "",
                startDate: e.startDate ? new Date(e.startDate as string).toISOString().slice(0, 7) : "",
                endDate: e.endDate ? new Date(e.endDate as string).toISOString().slice(0, 7) : "",
                isCurrent: (e.isCurrent as boolean) ?? false,
                description: (e.description as string) ?? "",
              }))
            : prev.experience,
          education: profile.education?.length
            ? profile.education.map((e: Record<string, unknown>) => ({
                degree: (e.degree as string) ?? "",
                institution: (e.institution as string) ?? "",
                field: (e.field as string) ?? "",
                graduationDate: e.graduationDate ? new Date(e.graduationDate as string).toISOString().slice(0, 7) : "",
                grade: (e.grade as string) ?? "",
              }))
            : prev.education,
          languages: profile.languages?.length
            ? profile.languages.map((l: Record<string, unknown>) => ({
                language: (l.language as string) ?? "",
                proficiency: (l.proficiency as LanguageSkill["proficiency"]) ?? "conversational",
              }))
            : prev.languages,
          certifications: profile.certifications?.length ? profile.certifications : prev.certifications,
        }));
      }
      const sessionRes = await fetch("/api/auth/session");
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        if (session?.user) {
          setForm((prev) => ({
            ...prev,
            fullName: prev.fullName || session.user.name || "",
            email: prev.email || session.user.email || "",
          }));
        }
      }
    } catch {
      // Non-blocking — user can fill manually
    } finally {
      setLoading(false);
    }
  }

  /* ── Import from CV (AI Extract) ── */

  async function handleImportCV(file: File) {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Supported formats: PDF, JPG, PNG, WEBP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be under 10 MB");
      return;
    }

    setImporting(true);
    setImportProgress(10);
    setError("");
    const tick = setInterval(() => setImportProgress((p) => Math.min(p + 8, 85)), 500);

    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/ai/cv-extract", { method: "POST", body: formData });
      clearInterval(tick);
      setImportProgress(100);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? "Import failed");
      }

      const data = await res.json();
      const ext = data.extracted;

      setForm((prev) => ({
        ...prev,
        fullName: ext.fullName || prev.fullName,
        phone: ext.phone || prev.phone,
        nationality: ext.nationality || prev.nationality,
        currentLocation: ext.currentLocation || prev.currentLocation,
        headline: ext.headline || prev.headline,
        linkedin: ext.linkedin || prev.linkedin,
        portfolio: ext.portfolio || prev.portfolio,
        skills: ext.skills?.length
          ? ext.skills.map((s: { name?: string } | string) => typeof s === "string" ? s : s.name ?? "").filter(Boolean)
          : prev.skills,
        experience: ext.experience?.length
          ? ext.experience.map((e: Record<string, unknown>) => ({
              jobTitle: (e.jobTitle as string) ?? "",
              company: (e.company as string) ?? "",
              country: (e.location as string) ?? "",
              startDate: (e.from as string) ?? "",
              endDate: e.to !== "present" ? (e.to as string) ?? "" : "",
              isCurrent: (e.current as boolean) || e.to === "present",
              description: (e.description as string) ?? "",
            }))
          : prev.experience,
        education: ext.education?.length
          ? ext.education.map((e: Record<string, unknown>) => ({
              degree: (e.degree as string) ?? "",
              institution: (e.institution as string) ?? "",
              field: (e.field as string) ?? "",
              graduationDate: (e.to as string) ?? "",
              grade: (e.grade as string) ?? "",
            }))
          : prev.education,
        languages: ext.languages?.length
          ? ext.languages.map((l: Record<string, unknown>) => ({
              language: (l.language as string) ?? "",
              proficiency: (l.level === "native" ? "native"
                : l.level === "fluent" ? "professional"
                : l.level === "intermediate" ? "conversational"
                : "basic") as LanguageSkill["proficiency"],
            }))
          : prev.languages,
        certifications: ext.certifications?.length ? ext.certifications : prev.certifications,
      }));
      setSuccessMsg("CV imported successfully! Review and edit the fields below.");
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (e) {
      clearInterval(tick);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }

  /* ── Skills ── */

  function addSkill() {
    const name = skillInput.trim();
    if (!name || form.skills.some((s) => s.toLowerCase() === name.toLowerCase())) return;
    setForm((f) => ({ ...f, skills: [...f.skills, name] }));
    setSkillInput("");
  }

  function removeSkill(index: number) {
    setForm((f) => ({ ...f, skills: f.skills.filter((_, i) => i !== index) }));
  }

  /* ── Certifications ── */

  function addCert() {
    const name = certInput.trim();
    if (!name) return;
    setForm((f) => ({ ...f, certifications: [...f.certifications, name] }));
    setCertInput("");
  }

  function removeCert(index: number) {
    setForm((f) => ({ ...f, certifications: f.certifications.filter((_, i) => i !== index) }));
  }

  /* ── Experience ── */

  function addExperience() {
    setForm((f) => ({ ...f, experience: [...f.experience, { ...EMPTY_EXPERIENCE }] }));
  }

  function updateExperience(index: number, field: keyof WorkExperience, value: string | boolean) {
    setForm((f) => ({
      ...f,
      experience: f.experience.map((e, i) =>
        i === index ? { ...e, [field]: value, ...(field === "isCurrent" && value ? { endDate: "" } : {}) } : e
      ),
    }));
  }

  function removeExperience(index: number) {
    setForm((f) => ({ ...f, experience: f.experience.filter((_, i) => i !== index) }));
  }

  /* ── Education ── */

  function addEducation() {
    setForm((f) => ({ ...f, education: [...f.education, { ...EMPTY_EDUCATION }] }));
  }

  function updateEducation(index: number, field: keyof Education, value: string) {
    setForm((f) => ({
      ...f,
      education: f.education.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  }

  function removeEducation(index: number) {
    setForm((f) => ({ ...f, education: f.education.filter((_, i) => i !== index) }));
  }

  /* ── Languages ── */

  function addLanguage() {
    setForm((f) => ({ ...f, languages: [...f.languages, { ...EMPTY_LANGUAGE }] }));
  }

  function updateLanguage(index: number, field: keyof LanguageSkill, value: string) {
    setForm((f) => ({
      ...f,
      languages: f.languages.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    }));
  }

  function removeLanguage(index: number) {
    setForm((f) => ({ ...f, languages: f.languages.filter((_, i) => i !== index) }));
  }

  /* ── Save to Profile ── */

  async function handleSaveToProfile() {
    setSaving(true);
    setError("");
    try {
      const body = {
        summary: form.headline,
        phone: form.phone,
        nationality: form.nationality,
        currentLocation: form.currentLocation,
        skills: form.skills,
        experience: form.experience.map((e) => ({
          jobTitle: e.jobTitle,
          company: e.company,
          country: e.country,
          startDate: e.startDate || undefined,
          endDate: e.endDate || undefined,
          isCurrent: e.isCurrent,
          description: e.description,
        })),
        education: form.education.map((e) => ({
          degree: e.degree,
          institution: e.institution,
          field: e.field,
          graduationDate: e.graduationDate || undefined,
          grade: e.grade,
        })),
        languages: form.languages.map((l) => ({
          language: l.language,
          proficiency: l.proficiency,
        })),
        certifications: form.certifications,
      };
      const res = await fetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      toast.success("Profile saved successfully!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  /* ── PDF Download ── */

  async function handleDownloadPDF() {
    setError("");
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { CVDocument } = await import("./cv-pdf-template");
      const blob = await pdf(<CVDocument data={form} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.fullName || "CV"}_Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStep("download");
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError("Failed to generate PDF. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Step Indicator */}
      <div className="flex items-start gap-2 mb-8">
        <StepDot n={1} label="Edit" active={step === "edit"} done={step !== "edit"} />
        <div className={`flex-1 mt-[15px] h-0.5 transition-colors ${step !== "edit" ? "bg-primary" : "bg-muted"}`} />
        <StepDot n={2} label="Preview" active={step === "preview"} done={step === "download"} />
        <div className={`flex-1 mt-[15px] h-0.5 transition-colors ${step === "download" ? "bg-primary" : "bg-muted"}`} />
        <StepDot n={3} label="Download" active={step === "download"} done={false} />
      </div>

      <PageHeader
        title={
          step === "edit" ? "Build Your CV"
            : step === "preview" ? "Preview Your CV"
              : "Download Your CV"
        }
        description={
          step === "edit" ? "Fill in your details or import from an existing CV"
            : step === "preview" ? "Review how your CV will look before downloading"
              : "Your CV is ready to download"
        }
      />

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── STEP 1: EDIT ── */}
      {step === "edit" && (
        <div className="space-y-6">
          {/* Import from CV */}
          <div className="card-base p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Import from CV</p>
                  <p className="text-xs text-muted-foreground">Upload a PDF or image and let AI fill in the fields</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="gap-2 shrink-0"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Importing..." : "Upload CV"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCV(f); }}
              />
            </div>
            {importing && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>AI is reading your CV...</span>
                  <span>{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}
          </div>

          {/* Personal Information */}
          <SectionCard title="Personal Information" icon={<UserIcon className="w-4 h-4" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Full Name" value={form.fullName}
                onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder="Your full name" />
              <FormField label="Email" value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="Contact email for your CV" />
              <FormField label="Phone" value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+971 50 000 0000" />
              <FormField label="Nationality" value={form.nationality}
                onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} placeholder="e.g. Indian" />
              <div className="md:col-span-2">
                <FormField label="Current Location" value={form.currentLocation}
                  onChange={(v) => setForm((f) => ({ ...f, currentLocation: v }))} placeholder="City, Country" />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Professional Summary</Label>
                <Textarea
                  value={form.headline}
                  onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                  placeholder="Brief professional summary or headline..."
                  rows={3}
                  className="resize-none"
                />
              </div>
              <FormField label="LinkedIn" value={form.linkedin}
                onChange={(v) => setForm((f) => ({ ...f, linkedin: v }))} placeholder="https://linkedin.com/in/..." />
              <FormField label="Portfolio / Website" value={form.portfolio}
                onChange={(v) => setForm((f) => ({ ...f, portfolio: v }))} placeholder="https://..." />
            </div>
          </SectionCard>

          {/* Experience */}
          <SectionCard
            title={`Experience (${form.experience.length})`}
            icon={<Briefcase className="w-4 h-4" />}
            action={<Button variant="outline" size="sm" onClick={addExperience} className="gap-1 h-7 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>}
          >
            {form.experience.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No experience added yet. Click &quot;Add&quot; to start.
              </p>
            )}
            <div className="space-y-4">
              {form.experience.map((exp, i) => (
                <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                  <button
                    onClick={() => removeExperience(i)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField label="Job Title" value={exp.jobTitle}
                      onChange={(v) => updateExperience(i, "jobTitle", v)} placeholder="e.g. Senior Developer" />
                    <FormField label="Company" value={exp.company}
                      onChange={(v) => updateExperience(i, "company", v)} placeholder="Company name" />
                    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <FormField label="Location" value={exp.country}
                        onChange={(v) => updateExperience(i, "country", v)} placeholder="City, Country" />
                      <FormField label="From" value={exp.startDate} type="month"
                        onChange={(v) => updateExperience(i, "startDate", v)} />
                      {!exp.isCurrent ? (
                        <FormField label="To" value={exp.endDate} type="month"
                          onChange={(v) => updateExperience(i, "endDate", v)} />
                      ) : (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">To</Label>
                          <div className="h-10 flex items-center text-sm text-muted-foreground">Present</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={exp.isCurrent}
                      onChange={(e) => updateExperience(i, "isCurrent", e.target.checked)}
                      className="rounded border-muted-foreground/40"
                      id={`current-${i}`}
                    />
                    <label htmlFor={`current-${i}`} className="text-xs text-muted-foreground">I currently work here</label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <Textarea
                      value={exp.description}
                      onChange={(e) => updateExperience(i, "description", e.target.value)}
                      placeholder="Key responsibilities and achievements..."
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Education */}
          <SectionCard
            title={`Education (${form.education.length})`}
            icon={<GraduationCap className="w-4 h-4" />}
            action={<Button variant="outline" size="sm" onClick={addEducation} className="gap-1 h-7 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>}
          >
            {form.education.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No education added yet. Click &quot;Add&quot; to start.
              </p>
            )}
            <div className="space-y-4">
              {form.education.map((edu, i) => (
                <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                  <button
                    onClick={() => removeEducation(i)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField label="Degree" value={edu.degree}
                      onChange={(v) => updateEducation(i, "degree", v)} placeholder="e.g. Bachelor of Science" />
                    <FormField label="Field of Study" value={edu.field}
                      onChange={(v) => updateEducation(i, "field", v)} placeholder="e.g. Computer Science" />
                    <FormField label="Institution" value={edu.institution}
                      onChange={(v) => updateEducation(i, "institution", v)} placeholder="University name" />
                    <FormField label="Graduation Date" value={edu.graduationDate} type="month"
                      onChange={(v) => updateEducation(i, "graduationDate", v)} />
                    <FormField label="Grade / GPA" value={edu.grade}
                      onChange={(v) => updateEducation(i, "grade", v)} placeholder="e.g. 3.8 / 4.0" />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Skills */}
          <SectionCard title={`Skills (${form.skills.length})`} icon={<Award className="w-4 h-4" />}>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {form.skills.map((s, i) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1 pe-1 py-1">
                  {s}
                  <button
                    onClick={() => removeSkill(i)}
                    className="ms-1.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                  >
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </Badge>
              ))}
              {form.skills.length === 0 && (
                <p className="text-xs text-muted-foreground">No skills yet — add some below</p>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                placeholder="Type a skill and press Enter..."
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={addSkill} className="h-8 gap-1 shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </SectionCard>

          {/* Languages */}
          <SectionCard
            title={`Languages (${form.languages.length})`}
            icon={<Globe className="w-4 h-4" />}
            action={<Button variant="outline" size="sm" onClick={addLanguage} className="gap-1 h-7 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>}
          >
            {form.languages.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No languages added yet.
              </p>
            )}
            <div className="space-y-3">
              {form.languages.map((lang, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 group">
                  <FormField label="Language" value={lang.language}
                    onChange={(v) => updateLanguage(i, "language", v)} placeholder="e.g. English" />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Proficiency</Label>
                    <SearchableSelect
                      options={PROFICIENCY_OPTIONS}
                      value={lang.proficiency}
                      onValueChange={(v) => updateLanguage(i, "proficiency", v)}
                    />
                  </div>
                  <button
                    onClick={() => removeLanguage(i)}
                    className="mb-[5px] opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Certifications */}
          <SectionCard title={`Certifications (${form.certifications.length})`} icon={<Award className="w-4 h-4" />}>
            <div className="space-y-2">
              {form.certifications.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm group">
                  <span className="flex-1">{c}</span>
                  <button
                    onClick={() => removeCert(i)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
                placeholder="Add a certification..."
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={addCert} className="h-8 gap-1 shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>
          </SectionCard>

          {/* Action Bar */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t pt-4 pb-2 flex flex-col sm:flex-row gap-3">
            <Button onClick={() => setStep("preview")} className="gap-2 flex-1">
              <Eye className="w-4 h-4" />
              Preview CV
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveToProfile}
              disabled={saving}
              className="gap-2 flex-1 sm:flex-none sm:min-w-[160px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save to Profile"}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: PREVIEW ── */}
      {step === "preview" && (
        <div className="space-y-6">
          <CVPreview data={form} />

          <div className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t pt-4 pb-2 flex flex-col sm:flex-row gap-3">
            <Button onClick={handleDownloadPDF} className="gap-2 flex-1">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => setStep("edit")} className="gap-2 flex-1 sm:flex-none sm:min-w-[140px]">
              <Pencil className="w-4 h-4" />
              Back to Edit
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveToProfile}
              disabled={saving}
              className="gap-2 flex-1 sm:flex-none sm:min-w-[160px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save to Profile
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: DOWNLOAD COMPLETE ── */}
      {step === "download" && (
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">CV Downloaded!</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              Your professional CV has been generated and downloaded.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => router.push("./profile")} className="gap-2">
              View Full Profile <ArrowRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={() => setStep("edit")} className="gap-2">
              <Pencil className="w-4 h-4" /> Edit CV
            </Button>
            <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
              <Download className="w-4 h-4" /> Download Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SectionCard({
  title, icon, action, children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-base p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function FormField({
  label, value, onChange, placeholder, readOnly, type = "text",
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        className={readOnly ? "bg-muted/40 cursor-not-allowed opacity-70" : ""}
      />
    </div>
  );
}

function StepDot({
  n, label, active, done,
}: {
  n: number; label: string; active: boolean; done: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
          ${done ? "bg-primary text-primary-foreground"
            : active ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"}`}
      >
        {done ? <CheckCircle className="w-4 h-4" /> : n}
      </div>
      <span className={`text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  );
}

/* ── CV Preview (HTML) ── */

function CVPreview({ data }: { data: CVForm }) {
  return (
    <div className="bg-white border rounded-xl shadow-sm p-8 max-w-3xl mx-auto space-y-6 print:shadow-none">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">{data.fullName || "Your Name"}</h1>
        {data.headline && <p className="text-sm text-gray-600 mt-1">{data.headline}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.currentLocation && <span>{data.currentLocation}</span>}
          {data.nationality && <span>{data.nationality}</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 mt-1 text-xs text-blue-600">
          {data.linkedin && <span>{data.linkedin}</span>}
          {data.portfolio && <span>{data.portfolio}</span>}
        </div>
      </div>

      {/* Experience */}
      {data.experience.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1 mb-3">Experience</h2>
          <div className="space-y-4">
            {data.experience.map((exp, i) => (
              <div key={i}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{exp.jobTitle}</p>
                    <p className="text-xs text-gray-600">{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {exp.startDate} – {exp.isCurrent ? "Present" : exp.endDate}
                  </span>
                </div>
                {exp.description && (
                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{exp.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1 mb-3">Education</h2>
          <div className="space-y-3">
            {data.education.map((edu, i) => (
              <div key={i} className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ""}
                  </p>
                  <p className="text-xs text-gray-600">{edu.institution}</p>
                  {edu.grade && <p className="text-xs text-gray-500">Grade: {edu.grade}</p>}
                </div>
                {edu.graduationDate && (
                  <span className="text-xs text-gray-500">{edu.graduationDate}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1 mb-3">Skills</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((s, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {data.languages.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1 mb-3">Languages</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.languages.map((l, i) => (
              <span key={i} className="text-xs text-gray-700">
                {l.language} <span className="text-gray-500 capitalize">({l.proficiency})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Certifications */}
      {data.certifications.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide border-b pb-1 mb-3">Certifications</h2>
          <ul className="list-disc list-inside space-y-0.5">
            {data.certifications.map((c, i) => (
              <li key={i} className="text-xs text-gray-700">{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}