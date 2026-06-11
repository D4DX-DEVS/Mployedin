"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Upload, CheckCircle, AlertCircle, Sparkles,
  X, Plus, Pencil, Save, Download, Loader2,
  Trash2, Eye, EyeOff, Briefcase, GraduationCap,
  Globe, Award, User as UserIcon, FolderKanban,
  LayoutTemplate, Paintbrush, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Autocomplete, TagAutocomplete } from "@/components/ui/tag-autocomplete";
import type { TaxonomyType } from "@/lib/taxonomy/seeds";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { csrfFetch } from "@/lib/security/csrf-client";

import type {
  CVForm, WorkExperience, Education, LanguageSkill,
  Project, SocialLink, FormattingOptions,
} from "./types";
import type { CVPDFLabels } from "./cv-pdf-document";
import {
  PROFICIENCY_OPTIONS, EMPTY_EXPERIENCE, EMPTY_EDUCATION,
  EMPTY_LANGUAGE, EMPTY_PROJECT, EMPTY_LINK,
  DEFAULT_FORMATTING, THEME_COLORS, toMonthInput,
} from "./types";
import { TemplateRenderer } from "./templates";
import { TemplatePicker, FormattingPanel } from "./template-picker";
import { AIWriteButton } from "./ai-write-button";
import { MonthYearPicker } from "./month-picker";

/* ── Filter out hidden sections for preview/PDF ── */
function getVisibleForm(form: CVForm, hidden: Set<string>): CVForm {
  return {
    ...form,
    experience: hidden.has("experience") ? [] : form.experience,
    education: hidden.has("education") ? [] : form.education,
    skills: hidden.has("skills") ? [] : form.skills,
    projects: hidden.has("projects") ? [] : form.projects,
    languages: hidden.has("languages") ? [] : form.languages,
    certifications: hidden.has("certifications") ? [] : form.certifications,
  };
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ══════════════════════════════════════════════════════════ */

export default function CVBuilderPage() {
  const t = useTranslations("cvBuilderPage");
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
  const [certInput, setCertInput] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  /* Section visibility — controls which sections appear in preview & PDF */
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const toggleSection = (section: string) => setHiddenSections((prev) => {
    const next = new Set(prev);
    if (next.has(section)) next.delete(section); else next.add(section);
    return next;
  });

  /* Template & formatting */
  const [selectedTemplate, setSelectedTemplate] = useState("classic");
  const [formatting, setFormatting] = useState<FormattingOptions>(DEFAULT_FORMATTING);

  const [form, setForm] = useState<CVForm>({
    fullName: "", email: "", phone: "", nationality: "", currentLocation: "",
    headline: "", photo: "", linkedin: "", portfolio: "", additionalLinks: [],
    skills: [], experience: [], education: [], languages: [], certifications: [], projects: [],
  });

  useEffect(() => {
    document.title = t("documentTitle");
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
          photo: profile.avatar ?? prev.photo,
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

      }
      const session = await getSession();
      if (session?.user) {
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || session.user?.name || "",
          email: prev.email || session.user?.email || "",
          photo: prev.photo || session.user?.image || "",
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
      setError(t("errors.supportedFormats"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t("errors.fileSize"));
      return;
    }

    setImporting(true);
    setImportProgress(10);
    setError("");
    const tick = setInterval(() => setImportProgress((p) => Math.min(p + 8, 85)), 500);

    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await csrfFetch("/api/ai/cv-extract", { method: "POST", body: formData });
      clearInterval(tick);
      setImportProgress(100);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? t("errors.importFailed"));
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
                links.push({ label: l.label ?? t("defaults.link"), url: l.url });
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
      setSuccessMsg(t("messages.importSuccess"));
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch (e) {
      clearInterval(tick);
      setError(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  }

  /* ── Form helpers ── */
  function addLink()    { setForm((f) => ({ ...f, additionalLinks: [...f.additionalLinks, { ...EMPTY_LINK }] })); }
  function updateLink(i: number, field: keyof SocialLink, v: string)  { setForm((f) => ({ ...f, additionalLinks: f.additionalLinks.map((l, j) => j === i ? { ...l, [field]: v } : l) })); }
  function removeLink(i: number)    { setForm((f) => ({ ...f, additionalLinks: f.additionalLinks.filter((_, j) => j !== i) })); }

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

  /* ── Photo upload ── */
  async function handlePhotoUpload(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error(t("errors.supportedFormats"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("errors.fileSize"));
      return;
    }
    // Optimistic local preview
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo: reader.result as string }));
    reader.readAsDataURL(file);

    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await csrfFetch("/api/job-seekers/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("errors.saveFailed"));
      }
      const data = await res.json();
      setForm((f) => ({ ...f, photo: data.url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

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
      const res = await csrfFetch("/api/job-seeker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(t("errors.saveProfile"));
      toast.success(t("messages.profileSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  /* ── PDF Download ── */
  const [pdfLoading, setPdfLoading] = useState(false);
  async function handleDownloadPDF() {
    setError("");
    setPdfLoading(true);
    try {
      const [{ pdf }, { CVPDFDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./cv-pdf-document"),
      ]);
      const visibleForm = getVisibleForm(form, hiddenSections);
      const blob = await pdf(
        <CVPDFDocument data={visibleForm} templateId={selectedTemplate} formatting={formatting} labels={cvPdfLabels} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.fullName || "CV"}_Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("messages.downloaded"));
    } catch (e) {
      console.error("PDF generation failed:", e);
      setError(t("errors.pdfFailed"));
    } finally {
      setPdfLoading(false);
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
  const proficiencyOptions = PROFICIENCY_OPTIONS.map((option) => ({
    ...option,
    label: t(`proficiency.${option.value}`),
  }));
  const cvPdfLabels: CVPDFLabels = {
    yourName: t("previewSections.yourName"),
    present: t("previewSections.present"),
    experience: t("previewSections.experience"),
    education: t("previewSections.education"),
    grade: t("previewSections.grade"),
    skills: t("previewSections.skills"),
    projects: t("previewSections.projects"),
    languages: t("previewSections.languages"),
    certifications: t("previewSections.certifications"),
    atCompany: t("previewSections.atCompany", { company: "{company}" }),
    proficiency: {
      basic: t("proficiency.basic"),
      conversational: t("proficiency.conversational"),
      professional: t("proficiency.professional"),
      native: t("proficiency.native"),
    },
  };

  /* ══════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════ */

  return (
    <div className="page-container">
      <PageHeader
        title={t("header.title")}
        description={t("header.description")}
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
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ────── LEFT: EDITOR PANEL ────── */}
        <div className={`transition-all duration-300 ${previewExpanded ? "hidden" : "w-full lg:w-[55%]"}`}>
          <Tabs defaultValue="editor" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="editor" className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                {t("tabs.editor")}
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" />
                {t("tabs.templates")}
              </TabsTrigger>
              <TabsTrigger value="formatting" className="gap-1.5">
                <Paintbrush className="w-3.5 h-3.5" />
                {t("tabs.formatting")}
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
                        <p className="text-sm font-semibold">{t("import.title")}</p>
                        <p className="text-xs text-muted-foreground">{t("import.description")}</p>
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
                      {importing ? t("import.importing") : t("import.upload")}
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
                        <span>{t("import.reading")}</span>
                        <span>{importProgress}%</span>
                      </div>
                      <Progress value={importProgress} className="h-2" />
                    </div>
                  )}
                </div>

                {/* Personal Information */}
                <SectionCard title={t("sections.personalDetails")} icon={<UserIcon className="w-4 h-4" />}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Profile photo */}
                    <div className="md:col-span-2 flex items-center gap-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                        {form.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form.photo} alt={form.fullName || "Profile photo"} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <UserIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t("fields.photo")}</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button" variant="outline" size="sm" disabled={photoUploading}
                            onClick={() => photoInputRef.current?.click()} className="h-8 gap-1.5 text-xs"
                          >
                            {photoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {form.photo ? t("actions.changePhoto") : t("actions.uploadPhoto")}
                          </Button>
                          {form.photo && (
                            <Button
                              type="button" variant="ghost" size="sm"
                              onClick={() => setForm((f) => ({ ...f, photo: "" }))} className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> {t("actions.removePhoto")}
                            </Button>
                          )}
                        </div>
                        <p className="text-[0.65rem] text-muted-foreground">{t("hints.photo")}</p>
                        <input
                          ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
                        />
                      </div>
                    </div>
                    <FormField label={t("fields.fullName")} value={form.fullName}
                      onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder={t("placeholders.fullName")} />
                    <FormField label={t("fields.email")} value={form.email}
                      onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder={t("placeholders.email")} />
                    <FormField label={t("fields.phone")} value={form.phone}
                      onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+971 50 000 0000" />
                    <FormField label={t("fields.nationality")} value={form.nationality}
                      onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} placeholder={t("placeholders.nationality")} />
                    <div className="md:col-span-2">
                      <AutoFormField label={t("fields.currentLocation")} value={form.currentLocation} taxonomy="locations"
                        onChange={(v) => setForm((f) => ({ ...f, currentLocation: v }))} placeholder={t("placeholders.location")} />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">{t("fields.profileSummary")}</Label>
                        <AIWriteButton
                          section="summary"
                          context={{ currentText: form.headline, skills: form.skills.join(", ") }}
                          onResult={(text) => setForm((f) => ({ ...f, headline: text }))}
                          label={t("actions.writeWithAi")}
                        />
                      </div>
                      <Textarea
                        value={form.headline}
                        onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                        placeholder={t("placeholders.summary")}
                        rows={3}
                        className="resize-none"
                      />
                      <p className="text-[0.65rem] text-muted-foreground text-right">{form.headline.length}/1000</p>
                    </div>
                    <FormField label="LinkedIn" value={form.linkedin}
                      onChange={(v) => setForm((f) => ({ ...f, linkedin: v }))} placeholder="https://linkedin.com/in/..." />
                    <FormField label={t("fields.portfolio")} value={form.portfolio}
                      onChange={(v) => setForm((f) => ({ ...f, portfolio: v }))} placeholder="https://..." />
                    {form.additionalLinks.map((link, i) => (
                      <div key={i} className="md:col-span-2 grid grid-cols-[1fr_2fr_auto] items-end gap-3 group">
                        <FormField label={t("fields.title")} value={link.label}
                          onChange={(v) => updateLink(i, "label", v)} placeholder={t("placeholders.linkTitle")} />
                        <FormField label={t("fields.url")} value={link.url}
                          onChange={(v) => updateLink(i, "url", v)} placeholder="https://..." />
                        <button onClick={() => removeLink(i)} className="mb-[5px] text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="md:col-span-2">
                      <Button variant="ghost" size="sm" onClick={addLink} className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground">
                        <Plus className="w-3.5 h-3.5" /> {t("actions.addAnotherLink")}
                      </Button>
                    </div>
                  </div>
                </SectionCard>

                {/* Experience */}
                <SectionCard
                  title={t("sections.workExperience", { count: form.experience.length })}
                  icon={<Briefcase className="w-4 h-4" />}
                  badge={<span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />{t("badges.aiPowered")}</span>}
                  action={<Button variant="outline" size="sm" onClick={addExperience} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> {t("actions.add")}</Button>}
                  sectionKey="experience" hidden={hiddenSections.has("experience")} onToggle={() => toggleSection("experience")}
                >
                  {form.experience.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("empty.experience")}</p>
                  )}
                  <div className="space-y-4">
                    {form.experience.map((exp, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeExperience(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <FormField label={t("fields.jobTitle")} value={exp.jobTitle}
                            onChange={(v) => updateExperience(i, "jobTitle", v)} placeholder={t("placeholders.jobTitle")} />
                          <FormField label={t("fields.company")} value={exp.company}
                            onChange={(v) => updateExperience(i, "company", v)} placeholder={t("placeholders.company")} />
                          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <AutoFormField label={t("fields.location")} value={exp.country} taxonomy="locations"
                              onChange={(v) => updateExperience(i, "country", v)} placeholder={t("placeholders.location")} />
                            <MonthYearPicker label={t("fields.from")} value={exp.startDate}
                              onChange={(v) => updateExperience(i, "startDate", v)} />
                            {!exp.isCurrent ? (
                              <MonthYearPicker label={t("fields.to")} value={exp.endDate}
                                onChange={(v) => updateExperience(i, "endDate", v)} />
                            ) : (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{t("fields.to")}</Label>
                                <div className="h-10 flex items-center text-sm text-muted-foreground">{t("fields.present")}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={exp.isCurrent}
                            onChange={(e) => updateExperience(i, "isCurrent", e.target.checked)}
                            className="rounded border-muted-foreground/40" id={`current-${i}`} />
                          <label htmlFor={`current-${i}`} className="text-xs text-muted-foreground">{t("fields.currentWork")}</label>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">{t("fields.description")}</Label>
                            <AIWriteButton
                              section="experience_description"
                              context={{ jobTitle: exp.jobTitle, company: exp.company, currentText: exp.description }}
                              onResult={(text) => updateExperience(i, "description", text)}
                            />
                          </div>
                          <Textarea
                            value={exp.description}
                            onChange={(e) => updateExperience(i, "description", e.target.value)}
                            placeholder={t("placeholders.experienceDescription")}
                            rows={2} className="resize-none text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Education */}
                <SectionCard
                  title={t("sections.education", { count: form.education.length })}
                  icon={<GraduationCap className="w-4 h-4" />}
                  action={<Button variant="outline" size="sm" onClick={addEducation} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> {t("actions.add")}</Button>}
                  sectionKey="education" hidden={hiddenSections.has("education")} onToggle={() => toggleSection("education")}
                >
                  {form.education.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("empty.education")}</p>
                  )}
                  <div className="space-y-4">
                    {form.education.map((edu, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeEducation(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <FormField label={t("fields.degree")} value={edu.degree}
                            onChange={(v) => updateEducation(i, "degree", v)} placeholder={t("placeholders.degree")} />
                          <AutoFormField label={t("fields.fieldOfStudy")} value={edu.field} taxonomy="specializations"
                            onChange={(v) => updateEducation(i, "field", v)} placeholder={t("placeholders.fieldOfStudy")} />
                          <FormField label={t("fields.institution")} value={edu.institution}
                            onChange={(v) => updateEducation(i, "institution", v)} placeholder={t("placeholders.institution")} />
                          <MonthYearPicker label={t("fields.graduationDate")} value={edu.graduationDate}
                            onChange={(v) => updateEducation(i, "graduationDate", v)} />
                          <FormField label={t("fields.grade")} value={edu.grade}
                            onChange={(v) => updateEducation(i, "grade", v)} placeholder={t("placeholders.grade")} />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Skills */}
                <SectionCard title={t("sections.skills", { count: form.skills.length })} icon={<Award className="w-4 h-4" />}
                  sectionKey="skills" hidden={hiddenSections.has("skills")} onToggle={() => toggleSection("skills")}
                >
                  <TagAutocomplete
                    type="skills"
                    value={form.skills}
                    onChange={(next) => setForm((f) => ({ ...f, skills: next }))}
                    placeholder={t("placeholders.skill")}
                    max={50}
                  />
                </SectionCard>

                {/* Projects */}
                <SectionCard
                  title={t("sections.projects", { count: form.projects.length })}
                  icon={<FolderKanban className="w-4 h-4" />}
                  badge={<span className="text-[0.6rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />{t("badges.aiPowered")}</span>}
                  action={<Button variant="outline" size="sm" onClick={addProject} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> {t("actions.add")}</Button>}
                  sectionKey="projects" hidden={hiddenSections.has("projects")} onToggle={() => toggleSection("projects")}
                >
                  {form.projects.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("empty.projects")}</p>
                  )}
                  <div className="space-y-4">
                    {form.projects.map((proj, i) => (
                      <div key={i} className="p-4 rounded-lg border bg-muted/20 space-y-3 relative group">
                        <button onClick={() => removeProject(i)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <FormField label={t("fields.projectTitle")} value={proj.title}
                              onChange={(v) => updateProject(i, "title", v)} placeholder={t("placeholders.projectTitle")} />
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">{t("fields.description")}</Label>
                              <AIWriteButton
                                section="project_description"
                                context={{ projectTitle: proj.title, techStack: proj.techStack.join(", "), currentText: proj.description }}
                                onResult={(text) => updateProject(i, "description", text)}
                              />
                            </div>
                            <Textarea value={proj.description}
                              onChange={(e) => updateProject(i, "description", e.target.value)}
                              placeholder={t("placeholders.projectDescription")} rows={2} className="resize-none text-sm" />
                          </div>
                          <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{t("fields.techStack")}</Label>
                            <Input value={proj.techStack.join(", ")}
                              onChange={(e) => updateProject(i, "techStack", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
                              placeholder={t("placeholders.techStack")} className="text-sm" />
                          </div>
                          <FormField label={t("fields.projectUrl")} value={proj.projectUrl}
                            onChange={(v) => updateProject(i, "projectUrl", v)} placeholder="https://..." />
                          <FormField label={t("fields.repositoryUrl")} value={proj.repoUrl}
                            onChange={(v) => updateProject(i, "repoUrl", v)} placeholder="https://github.com/..." />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* Languages */}
                <SectionCard
                  title={t("sections.languages", { count: form.languages.length })}
                  icon={<Globe className="w-4 h-4" />}
                  action={<Button variant="outline" size="sm" onClick={addLanguage} className="gap-1 h-7 text-xs"><Plus className="w-3.5 h-3.5" /> {t("actions.add")}</Button>}
                  sectionKey="languages" hidden={hiddenSections.has("languages")} onToggle={() => toggleSection("languages")}
                >
                  {form.languages.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">{t("empty.languages")}</p>}
                  <div className="space-y-3">
                    {form.languages.map((lang, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 group">
                        <FormField label={t("fields.language")} value={lang.language}
                          onChange={(v) => updateLanguage(i, "language", v)} placeholder={t("placeholders.language")} />
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t("fields.proficiency")}</Label>
                          <SearchableSelect options={proficiencyOptions} value={lang.proficiency}
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
                <SectionCard title={t("sections.certifications", { count: form.certifications.length })} icon={<Award className="w-4 h-4" />}
                  sectionKey="certifications" hidden={hiddenSections.has("certifications")} onToggle={() => toggleSection("certifications")}
                >
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
                      placeholder={t("placeholders.certification")} className="h-8 text-sm" />
                    <Button size="sm" variant="outline" onClick={addCert} className="h-8 gap-1 shrink-0">
                      <Plus className="w-3.5 h-3.5" /> {t("actions.add")}
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
            <Button onClick={handleDownloadPDF} disabled={pdfLoading} className="gap-2 flex-1">
              {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {t("actions.downloadPdf")}
            </Button>
            <Button variant="outline" onClick={handleSaveToProfile} disabled={saving} className="gap-2 flex-1 sm:flex-none sm:min-w-[160px]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? t("actions.saving") : t("actions.addToProfile")}
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
                {t("preview.resume")}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveToProfile}
                  disabled={saving}
                  className="h-7 text-xs gap-1"
                >
                  {t("actions.addToProfile")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={pdfLoading}
                  className="h-7 text-xs gap-1"
                >
                  {t("actions.download")}
                </Button>
                <button
                  onClick={() => setPreviewExpanded((p) => !p)}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                  title={previewExpanded ? t("preview.minimize") : t("preview.expand")}
                >
                  {previewExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Template preview */}
            <div className="p-6 min-h-[600px] max-h-[85vh] overflow-y-auto bg-white">
              <TemplateRenderer
                templateId={selectedTemplate}
                data={getVisibleForm(form, hiddenSections)}
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
  title, icon, badge, action, children, sectionKey, hidden, onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  sectionKey?: string;
  hidden?: boolean;
  onToggle?: () => void;
}) {
  const t = useTranslations("cvBuilderPage.visibility");
  return (
    <div className={`card-base p-4 sm:p-5 space-y-4 ${hidden ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title} {badge}
        </h3>
        <div className="flex items-center gap-2">
          {sectionKey && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                hidden
                  ? "text-muted-foreground hover:text-foreground bg-muted/50"
                  : "text-primary hover:text-primary/80 bg-primary/5"
              }`}
              title={hidden ? t("showInCv") : t("hideFromCv")}
            >
              {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {hidden ? t("hidden") : t("visible")}
            </button>
          )}
          {action}
        </div>
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

/* Label + taxonomy-backed single-value autocomplete (mirrors FormField styling). */
function AutoFormField({
  label, value, onChange, placeholder, taxonomy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  taxonomy: TaxonomyType;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Autocomplete
        type={taxonomy}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputClassName="h-10"
      />
    </div>
  );
}
