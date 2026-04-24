"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";
import {
  Upload, CheckCircle, AlertCircle, Sparkles,
  X, Plus, Pencil, Save, Download, Loader2,
  Trash2, Eye, Briefcase, GraduationCap,
  Globe, Award, User as UserIcon, FolderKanban,
  LayoutTemplate, Paintbrush, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";

import type {
  CVForm, WorkExperience, Education, LanguageSkill,
  Project, SocialLink, FormattingOptions,
} from "./types";
import {
  PROFICIENCY_OPTIONS, EMPTY_EXPERIENCE, EMPTY_EDUCATION,
  EMPTY_LANGUAGE, EMPTY_PROJECT, EMPTY_LINK,
  DEFAULT_FORMATTING, THEME_COLORS, toMonthInput,
} from "./types";
import { TemplateRenderer } from "./templates";
import { TemplatePicker, FormattingPanel } from "./template-picker";
import { AIWriteButton } from "./ai-write-button";

/* ══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════════════════ */

export default function CVBuilderPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(false);

  /* Template & formatting */
  const [selectedTemplate, setSelectedTemplate] = useState("classic");
  const [formatting, setFormatting] = useState<FormattingOptions>(DEFAULT_FORMATTING);
  const [templateFilter, setTemplateFilter] = useState<"all" | "free" | "pro">("all");
  const [hasProAccess, setHasProAccess] = useState(false);

  const [form, setForm] = useState<CVForm>({
    fullName: "", email: "", phone: "", nationality: "", currentLocation: "",
    headline: "", linkedin: "", portfolio: "", additionalLinks: [],
    skills: [], experience: [], education: [], languages: [], certifications: [], projects: [],
  });

  useEffect(() => {
    document.title = "CV Builder · MPLOYEDIN";
    fetchProfile();
  }, []);

  /* ── Fetch profile ── */
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
          linkedin: (() => {
            const linked = profile.socialLinks?.find((l: Record<string, unknown>) =>
              ((l.label as string) ?? "").toLowerCase() === "linkedin"
            );
            return (linked?.url as string) ?? prev.linkedin;
          })(),
          portfolio: (() => {
            const port = profile.socialLinks?.find((l: Record<string, unknown>) =>
              ["portfolio", "website"].includes(((l.label as string) ?? "").toLowerCase())
            );
            return (port?.url as string) ?? prev.portfolio;
          })(),
          additionalLinks: profile.socialLinks?.length
            ? profile.socialLinks
                .filter((l: Record<string, unknown>) =>
                  !["linkedin", "portfolio", "website"].includes(((l.label as string) ?? "").toLowerCase())
                )
                .map((l: Record<string, unknown>) => ({
                  label: (l.label as string) ?? "",
                  url: (l.url as string) ?? "",
                }))
            : prev.additionalLinks,
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
          projects: profile.projects?.length
            ? profile.projects.map((p: Record<string, unknown>) => ({
                title: (p.title as string) ?? "",
                description: (p.description as string) ?? "",
                techStack: Array.isArray(p.techStack) ? p.techStack as string[] : [],
                projectUrl: (p.projectUrl as string) ?? "",
                repoUrl: (p.repoUrl as string) ?? "",
              }))
            : prev.projects,
        }));

        // Check pro access
        if (profile.subscription?.resumeBuilderAccess) {
          setHasProAccess(true);
        }
      }
      const session = await getSession();
      if (session?.user) {
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || session.user?.name || "",
          email: prev.email || session.user?.email || "",
        }));
      }
    } catch {
      // Non-blocking
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
        email: ext.email || prev.email,
        phone: ext.phone || prev.phone,
        nationality: ext.nationality || prev.nationality,
        currentLocation: ext.currentLocation || prev.currentLocation,
        headline: ext.headline || prev.headline,
        linkedin: ext.linkedin
          || ext.socialLinks?.find((l: { label?: string }) => (l.label ?? "").toLowerCase() === "linkedin")?.url
          || prev.linkedin,
        portfolio: ext.portfolio
          || ext.socialLinks?.find((l: { label?: string }) => ["portfolio", "website"].includes((l.label ?? "").toLowerCase()))?.url
          || prev.portfolio,
        additionalLinks: (() => {
          const links: SocialLink[] = [];
          if (ext.socialLinks?.length) {
            for (const l of ext.socialLinks as { label?: string; url?: string }[]) {
              if (l.url && !["linkedin", "portfolio", "website"].includes((l.label ?? "").toLowerCase())) {
                links.push({ label: l.label ?? "Link", url: l.url });
              }
            }
          }
          return links.length ? links : prev.additionalLinks;
        })(),
        skills: ext.skills?.length
          ? ext.skills.map((s: { name?: string } | string) => typeof s === "string" ? s : s.name ?? "").filter(Boolean)
          : prev.skills,
        experience: ext.experience?.length
          ? ext.experience.map((e: Record<string, unknown>) => ({
              jobTitle: (e.jobTitle as string) ?? "",
              company: (e.company as string) ?? "",
              country: (e.location as string) ?? "",
              startDate: toMonthInput(e.from as string),
              endDate: e.to !== "present" ? toMonthInput(e.to as string) : "",
              isCurrent: (e.current as boolean) || e.to === "present",
              description: (e.description as string) ?? "",
            }))
          : prev.experience,
        education: ext.education?.length
          ? ext.education.map((e: Record<string, unknown>) => ({
              degree: (e.degree as string) ?? "",
              institution: (e.institution as string) ?? "",
              field: (e.field as string) ?? "",
              graduationDate: toMonthInput(e.to as string),
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
        projects: ext.projects?.length
          ? ext.projects.map((p: Record<string, unknown>) => ({
              title: (p.title as string) ?? "",
              description: (p.description as string) ?? "",
              techStack: Array.isArray(p.techStack) ? p.techStack as string[] : [],
              projectUrl: (p.projectUrl as string) ?? "",
              repoUrl: (p.repoUrl as string) ?? "",
            }))
          : prev.projects,
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

  /* ── Form helpers ── */
  function addLink()    { setForm((f) => ({ ...f, additionalLinks: [...f.additionalLinks, { ...EMPTY_LINK }] })); }
  function updateLink(i: number, field: keyof SocialLink, v: string)  { setForm((f) => ({ ...f, additionalLinks: f.additionalLinks.map((l, j) => j === i ? { ...l, [field]: v } : l) })); }
  function removeLink(i: number)    { setForm((f) => ({ ...f, additionalLinks: f.additionalLinks.filter((_, j) => j !== i) })); }

  function addSkill() { const n = skillInput.trim(); if (!n || form.skills.some((s) => s.toLowerCase() === n.toLowerCase())) return; setForm((f) => ({ ...f, skills: [...f.skills, n] })); setSkillInput(""); }
  function removeSkill(i: number) { setForm((f) => ({ ...f, skills: f.skills.filter((_, j) => j !== i) })); }

  function addCert() { const n = certInput.trim(); if (!n) return; setForm((f) => ({ ...f, certifications: [...f.certifications, n] })); setCertInput(""); }
  function removeCert(i: number) { setForm((f) => ({ ...f, certifications: f.certifications.filter((_, j) => j !== i) })); }

  function addExperience()  { setForm((f) => ({ ...f, experience: [...f.experience, { ...EMPTY_EXPERIENCE }] })); }
  function updateExperience(i: number, field: keyof WorkExperience, v: string | boolean) {
    setForm((f) => ({ ...f, experience: f.experience.map((e, j) => j === i ? { ...e, [field]: v, ...(field === "isCurrent" && v ? { endDate: "" } : {}) } : e) }));
  }
  function removeExperience(i: number) { setForm((f) => ({ ...f, experience: f.experience.filter((_, j) => j !== i) })); }

  function addEducation()   { setForm((f) => ({ ...f, education: [...f.education, { ...EMPTY_EDUCATION }] })); }
  function updateEducation(i: number, field: keyof Education, v: string) {
    setForm((f) => ({ ...f, education: f.education.map((e, j) => j === i ? { ...e, [field]: v } : e) }));
  }
  function removeEducation(i: number) { setForm((f) => ({ ...f, education: f.education.filter((_, j) => j !== i) })); }

  function addProject()     { setForm((f) => ({ ...f, projects: [...f.projects, { ...EMPTY_PROJECT }] })); }
  function updateProject(i: number, field: keyof Project, v: string | string[]) {
    setForm((f) => ({ ...f, projects: f.projects.map((p, j) => j === i ? { ...p, [field]: v } : p) }));
  }
  function removeProject(i: number) { setForm((f) => ({ ...f, projects: f.projects.filter((_, j) => j !== i) })); }

  function addLanguage()    { setForm((f) => ({ ...f, languages: [...f.languages, { ...EMPTY_LANGUAGE }] })); }
  function updateLanguage(i: number, field: keyof LanguageSkill, v: string) {
    setForm((f) => ({ ...f, languages: f.languages.map((l, j) => j === i ? { ...l, [field]: v } : l) }));
  }
  function removeLanguage(i: number) { setForm((f) => ({ ...f, languages: f.languages.filter((_, j) => j !== i) })); }

  /* ── Save to Profile ── */
  async function handleSaveToProfile() {
    setSaving(true);
    setError("");
    try {
      const body = {
        fullName: form.fullName,
        summary: form.headline,
        phone: form.phone,
        nationality: form.nationality,
        currentLocation: form.currentLocation,
        skills: form.skills,
        experience: form.experience.map((e) => ({
          jobTitle: e.jobTitle, company: e.company, country: e.country,
          startDate: e.startDate || undefined, endDate: e.endDate || undefined,
          isCurrent: e.isCurrent, description: e.description,
        })),
        education: form.education.map((e) => ({
          degree: e.degree, institution: e.institution, field: e.field,
          graduationDate: e.graduationDate || undefined, grade: e.grade,
        })),
        languages: form.languages.map((l) => ({ language: l.language, proficiency: l.proficiency })),
        certifications: form.certifications,
        projects: form.projects.map((p) => ({
          title: p.title, description: p.description, techStack: p.techStack,
          projectUrl: p.projectUrl || undefined, repoUrl: p.repoUrl || undefined,
        })),
        socialLinks: [
          ...(form.linkedin.trim() ? [{ label: "LinkedIn", url: form.linkedin.trim() }] : []),
          ...(form.portfolio.trim() ? [{ label: "Portfolio", url: form.portfolio.trim() }] : []),
          ...form.additionalLinks.filter((l) => l.url.trim()),
        ],
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
      const { CVPDFDocument } = await import("./cv-pdf-document");
      const blob = await pdf(
        <CVPDFDocument data={form} templateId={selectedTemplate} formatting={formatting} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.fullName || "CV"}_Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CV downloaded!");
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError("Failed to generate PDF. Please try again.");
    }
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const themeColor = THEME_COLORS.find((c) => c.id === formatting.themeColor)?.primary ?? "#2563eb";

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="page-container">
      <PageHeader
        title="CV Builder"
        description="Create a professional CV with AI assistance, templates, and custom formatting"
      />

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 mb-4">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── Split layout: Editor (left) + Live Preview (right) ── */}
      <div className="flex gap-6 items-start">

        {/* ────── LEFT: EDITOR PANEL ────── */}
        <div className={`transition-all duration-300 ${previewExpanded ? "hidden" : "w-full lg:w-[55%]"}`}>
          <Tabs defaultValue="editor" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="editor" className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                AI Editor
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="formatting" className="gap-1.5">
                <Paintbrush className="w-3.5 h-3.5" />
                Formatting
              </TabsTrigger>
            </TabsList>

            {/* ──── TAB: AI EDITOR ──── */}
            <TabsContent value="editor">
              <div className="space-y-5">
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
                <SectionCard title="Personal Details" icon={<UserIcon className="w-4 h-4" />}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Full Name" value={form.fullName}
                      onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder="Your full name" />
                    <FormField label="Email" value={form.email}
                      onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="Contact email" />
                    <FormField label="Phone" value={form.phone}
                      onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+971 50 000 0000" />
                    <FormField label="Nationality" value={form.nationality}
                      onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} placeholder="e.g. Indian" />
                    <div className="md:col-span-2">
                      <FormField label="Current Location" value={form.currentLocation}
                        onChange={(v) => setForm((f) => ({ ...f, currentLocation: v }))} placeholder="City, Country" />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Profile Summary</Label>
                        <AIWriteButton
                          section="summary"
                          context={{ currentText: form.headline, skills: form.skills.join(", ") }}
                          onResult={(text) => setForm((f) => ({ ...f, headline: text }))}
                          label="Write with AI ✦"
                        />
                      </div>
                      <Textarea
                        value={form.headline}
                        onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                        placeholder="Brief professional summary or headline..."
                        rows={3}
                        className="resize-none"
                      />
                      <p className="text-[0.65rem] text-muted-foreground text-right">{form.headline.length}/1000</p>
                    </div>
                    <FormField label="LinkedIn" value={form.linkedin}
                      onChange={(v) => setForm((f) => ({ ...f, linkedin: v }))} placeholder="https://linkedin.com/in/..." />
                    <FormField label="Portfolio / Website" value={form.portfolio}
                      onChange={(v) => setForm((f) => ({ ...f, portfolio: v }))} placeholder="https://..." />
                    {form.additionalLinks.map((link, i) => (
                      <div key={i} className="md:col-span-2 grid grid-cols-[1fr_2fr_auto] items-end gap-3 group">
                        <FormField label="Title" value={link.label}
                          onChange={(v) => updateLink(i, "label", v)} placeholder="e.g. GitHub" />
                        <FormField label="URL" value={link.url}
                          onChange={(v) => updateLink(i, "url", v)} placeholder="https://..." />
                        <button onClick={() => removeLink(i)} className="mb-[5px] text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="md:col-span-2">
                      <Button variant="ghost" size="sm" onClick={addLink} className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground">
                        <Plus className="w-3.5 h-3.5" /> Add another link
                      </Button>
                    </div>
                  </div>
                </SectionCard>

                {/* Experience */}
                <SectionCard
                  title={`Work Experience (${form.experience.length})`}
                  icon={<Briefcase className="w-4 h-4" />}
                  badge={<span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />AI-powered</span>}
                  action={<Button variant="outline" size="sm" onClick={addExperience} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> Add</Button>}
                >
                  {form.experience.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No experience yet. Click &quot;Add&quot; to start.</p>
                  )}
                  <div className="space-y-4">
                    {form.experience.map((exp, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeExperience(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
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
                          <input type="checkbox" checked={exp.isCurrent}
                            onChange={(e) => updateExperience(i, "isCurrent", e.target.checked)}
                            className="rounded border-muted-foreground/40" id={`current-${i}`} />
                          <label htmlFor={`current-${i}`} className="text-xs text-muted-foreground">I currently work here</label>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Description</Label>
                            <AIWriteButton
                              section="experience_description"
                              context={{ jobTitle: exp.jobTitle, company: exp.company, currentText: exp.description }}
                              onResult={(text) => updateExperience(i, "description", text)}
                            />
                          </div>
                          <Textarea
                            value={exp.description}
                            onChange={(e) => updateExperience(i, "description", e.target.value)}
                            placeholder="Key responsibilities and achievements..."
                            rows={2} className="resize-none text-sm"
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
                  action={<Button variant="outline" size="sm" onClick={addEducation} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> Add</Button>}
                >
                  {form.education.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No education yet. Click &quot;Add&quot; to start.</p>
                  )}
                  <div className="space-y-4">
                    {form.education.map((edu, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeEducation(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
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
                <SectionCard title={`Key Skills (${form.skills.length})`} icon={<Award className="w-4 h-4" />}>
                  <div className="flex flex-wrap gap-2 min-h-[2rem]">
                    {form.skills.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-xs gap-1 pe-1 py-1">
                        {s}
                        <button onClick={() => removeSkill(i)} className="ms-1.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors">
                          <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                    {form.skills.length === 0 && <p className="text-xs text-muted-foreground">No skills yet — add some below</p>}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                      placeholder="Type a skill and press Enter..." className="h-8 text-sm" />
                    <Button size="sm" variant="outline" onClick={addSkill} className="h-8 gap-1 shrink-0">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </Button>
                  </div>
                </SectionCard>

                {/* Projects */}
                <SectionCard
                  title={`Projects (${form.projects.length})`}
                  icon={<FolderKanban className="w-4 h-4" />}
                  badge={<span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />AI-powered</span>}
                  action={<Button variant="outline" size="sm" onClick={addProject} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> Add</Button>}
                >
                  {form.projects.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No projects yet. Click &quot;Add&quot; to start.</p>
                  )}
                  <div className="space-y-4">
                    {form.projects.map((proj, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeProject(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <FormField label="Project Title" value={proj.title}
                              onChange={(v) => updateProject(i, "title", v)} placeholder="e.g. E-Commerce Platform" />
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Description</Label>
                              <AIWriteButton
                                section="project_description"
                                context={{ projectTitle: proj.title, techStack: proj.techStack.join(", "), currentText: proj.description }}
                                onResult={(text) => updateProject(i, "description", text)}
                              />
                            </div>
                            <Textarea value={proj.description}
                              onChange={(e) => updateProject(i, "description", e.target.value)}
                              placeholder="Brief project description..." rows={2} className="resize-none text-sm" />
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Tech Stack</Label>
                            <Input value={proj.techStack.join(", ")}
                              onChange={(e) => updateProject(i, "techStack", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
                              placeholder="React, Node.js, MongoDB (comma-separated)" className="text-sm" />
                          </div>
                          <FormField label="Project URL" value={proj.projectUrl}
                            onChange={(v) => updateProject(i, "projectUrl", v)} placeholder="https://..." />
                          <FormField label="Repository URL" value={proj.repoUrl}
                            onChange={(v) => updateProject(i, "repoUrl", v)} placeholder="https://github.com/..." />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Languages */}
                <SectionCard
                  title={`Languages (${form.languages.length})`}
                  icon={<Globe className="w-4 h-4" />}
                  action={<Button variant="outline" size="sm" onClick={addLanguage} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> Add</Button>}
                >
                  {form.languages.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">No languages yet.</p>}
                  <div className="space-y-3">
                    {form.languages.map((lang, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 group">
                        <FormField label="Language" value={lang.language}
                          onChange={(v) => updateLanguage(i, "language", v)} placeholder="e.g. English" />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Proficiency</Label>
                          <SearchableSelect options={PROFICIENCY_OPTIONS} value={lang.proficiency}
                            onValueChange={(v) => updateLanguage(i, "proficiency", v)} />
                        </div>
                        <button onClick={() => removeLanguage(i)} className="mb-[5px] opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
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
                        <button onClick={() => removeCert(i)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input value={certInput} onChange={(e) => setCertInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }}
                      placeholder="Add a certification..." className="h-8 text-sm" />
                    <Button size="sm" variant="outline" onClick={addCert} className="h-8 gap-1 shrink-0">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </Button>
                  </div>
                </SectionCard>
              </div>
            </TabsContent>

            {/* ──── TAB: TEMPLATES ──── */}
            <TabsContent value="templates">
              <div className="card-base p-5">
                <TemplatePicker
                  selected={selectedTemplate}
                  onSelect={setSelectedTemplate}
                  themeColor={formatting.themeColor}
                  filter={templateFilter}
                  onFilterChange={setTemplateFilter}
                  hasProAccess={hasProAccess}
                />
              </div>
            </TabsContent>

            {/* ──── TAB: FORMATTING ──── */}
            <TabsContent value="formatting">
              <div className="card-base p-5">
                <FormattingPanel formatting={formatting} onChange={setFormatting} />
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Bar */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t pt-4 pb-2 mt-6 flex flex-col sm:flex-row gap-3">
            <Button onClick={handleDownloadPDF} className="gap-2 flex-1">
              <Download className="w-4 h-4" /> Download PDF
            </Button>
            <Button variant="outline" onClick={handleSaveToProfile} disabled={saving} className="gap-2 flex-1 sm:flex-none sm:min-w-[160px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Add to Profile"}
            </Button>
          </div>
        </div>

        {/* ────── RIGHT: LIVE PREVIEW PANEL ────── */}
        <div
          ref={previewRef}
          className={`hidden lg:block sticky top-4 transition-all duration-300 ${previewExpanded ? "w-full" : "w-[45%]"}`}
        >
          <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
            {/* Preview header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Eye className="w-3.5 h-3.5" />
                Resume ✎
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveToProfile}
                  disabled={saving}
                  className="h-7 text-xs gap-1"
                >
                  Add to profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  className="h-7 text-xs gap-1"
                >
                  Download
                </Button>
                <button
                  onClick={() => setPreviewExpanded((p) => !p)}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                  title={previewExpanded ? "Minimize" : "Expand"}
                >
                  {previewExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Template preview */}
            <div className="p-6 min-h-[600px] max-h-[85vh] overflow-y-auto bg-white">
              <TemplateRenderer
                templateId={selectedTemplate}
                data={form}
                formatting={formatting}
              />
            </div>

            {/* Progress bar indicator */}
            <div className="h-1.5 bg-muted">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, getCompleteness(form))}%`,
                  backgroundColor: themeColor,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: completeness % ── */
function getCompleteness(form: CVForm): number {
  let score = 0;
  if (form.fullName) score += 10;
  if (form.email) score += 5;
  if (form.phone) score += 5;
  if (form.headline) score += 15;
  if (form.skills.length > 0) score += 20;
  if (form.experience.length > 0) score += 20;
  if (form.education.length > 0) score += 15;
  if (form.languages.length > 0) score += 5;
  if (form.linkedin || form.portfolio) score += 5;
  return score;
}

/* ── Sub-components ── */

function SectionCard({
  title, icon, badge, action, children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-base p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title} {badge}
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
