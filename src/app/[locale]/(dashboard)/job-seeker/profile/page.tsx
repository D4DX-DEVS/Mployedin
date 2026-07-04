"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import {
  User, MapPin, Globe, Briefcase, GraduationCap, Award,
  Link2, Upload, Sparkles, BrainCircuit,
  CheckCircle2, Circle, Plus, Target, Zap,
  FileText, TrendingUp, ChevronRight, Languages as LanguagesIcon,
  UserCircle, Pencil, Camera, X, Clock, Calendar, Eye, EyeOff,
  FolderKanban, Trophy, Building2, Shield, Settings,
  Loader2, ExternalLink, Save, Github, Linkedin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/security/csrf-client";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="));
  return match?.split("=")[1] ?? "";
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Skill { name: string; level: string; yearsOfExperience: number; }
interface Experience { jobTitle: string; company: string; location: string; from: string; to: string; current: boolean; description: string; }
interface Education { degree: string; field: string; institution: string; country: string; from: string; to: string; }
interface Language { language: string; level: string; canRead?: boolean; canWrite?: boolean; canSpeak?: boolean; }
interface Project { title: string; description?: string; techStack: string[]; projectUrl?: string; repoUrl?: string; startDate?: string; endDate?: string; isCurrent?: boolean; }
interface Accomplishment { type: string; title: string; url?: string; description?: string; date?: string; }
interface CareerProfile {
  currentIndustry?: string; department?: string; roleCategory?: string; jobRole?: string;
  desiredJobType?: string[]; desiredEmploymentType?: string[]; preferredShift?: string;
}

interface ProfileData {
  userId: string;
  nationality: string;
  dateOfBirth: string;
  currentLocation: string;
  summary: string;
  headline?: string;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  languages: Language[];
  certifications: string[];
  linkedin: string;
  portfolio: string;
  socialLinks?: { label: string; url: string }[];
  profileCompleteness: number;
  cvFileUrl: string;
  cv?: { originalUrl?: string; parsedAt?: string; rawText?: string };
  cvExtractedByAI: boolean;
  badges: string[];
  // New fields
  projects?: Project[];
  accomplishments?: Accomplishment[];
  careerProfile?: CareerProfile;
  profileVisibility?: "visible" | "hidden";
  sectionVisibility?: Record<string, boolean>;
  availabilityStatus?: string;
  totalExperienceYears?: number;
  totalExperienceMonths?: number;
  noticePeriod?: number;
  updatedAt?: string;
  fullName?: string;
  preferredRoles?: string[];
}

type ChecklistStep = {
  id: string;
  label: string;
  bonus: string;
  done: boolean;
  href: string;
  icon: React.ElementType;
};

type ChecklistLabels = Record<"cv" | "skills" | "experience" | "education" | "personal" | "preferences", string>;

function buildChecklist(profile: ProfileData | null, labels: ChecklistLabels): ChecklistStep[] {
  return [
    { id: "cv",          label: labels.cv,          bonus: "+30%", done: !!(profile?.cvFileUrl || profile?.cv?.originalUrl), href: "./cv",                    icon: FileText      },
    { id: "skills",      label: labels.skills,      bonus: "+20%", done: (profile?.skills?.length ?? 0) > 0,        href: "./cv",                    icon: Award         },
    { id: "experience",  label: labels.experience,  bonus: "+15%", done: (profile?.experience?.length ?? 0) > 0,    href: "./cv",                    icon: Briefcase     },
    { id: "education",   label: labels.education,   bonus: "+10%", done: (profile?.education?.length ?? 0) > 0,     href: "./cv",                    icon: GraduationCap },
    { id: "personal",    label: labels.personal,    bonus: "+10%", done: !!(profile?.dateOfBirth || profile?.nationality), href: "./profile/personal-details", icon: UserCircle    },
    { id: "preferences", label: labels.preferences, bonus: "+15%", done: (profile?.preferredRoles?.length ?? 0) > 0,   href: "./preferences",           icon: Target        },
  ];
}

export default function JobSeekerProfilePage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const t = useTranslations("jobSeekerExtra.profile");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect unauthenticated users — guards against stale Next.js router cache
  // being served after logout before the server layout re-checks the session.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/${locale}/login`);
    }
  }, [status, locale, router]);

  // Edit modals
  const [showNameModal, setShowNameModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [showHeadlineModal, setShowHeadlineModal] = useState(false);
  const [editHeadline, setEditHeadline] = useState("");
  const [savingHeadline, setSavingHeadline] = useState(false);

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  async function handleGenerateSummary() {
    setGeneratingSummary(true);
    try {
      const res = await csrfFetch("/api/ai/generate-summary", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate summary");
      // Refetch the full profile to get consistent data after AI save
      await fetchProfile();
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingSummary(false);
    }
  }

  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [editVisibility, setEditVisibility] = useState<"visible" | "hidden">("visible");
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (session?.user?.image) setAvatarUrl(session.user.image);
  }, [session?.user?.image]);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/job-seeker/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // ── Avatar handlers ──────────────────────────────────────────────────────

  const handleAvatarSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError("");

    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      setAvatarError("Only JPEG, PNG, or WebP images.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/job-seekers/avatar", {
        method: "POST",
        body: form,
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const data = await res.json();
        setAvatarError(data.error ?? "Upload failed");
        setAvatarUrl(session?.user?.image ?? null);
        return;
      }
      const data = await res.json();
      setAvatarUrl(data.url);
      await updateSession({ image: data.url });
    } catch {
      setAvatarError("Network error. Please try again.");
      setAvatarUrl(session?.user?.image ?? null);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }, [session?.user?.image, updateSession]);

  const handleAvatarRemove = useCallback(async () => {
    setAvatarUploading(true);
    setAvatarError("");
    try {
      const res = await fetch("/api/job-seekers/avatar", {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (res.ok) {
        setAvatarUrl(null);
        await updateSession({ image: null });
      }
    } catch {
      setAvatarError("Failed to remove photo.");
    } finally {
      setAvatarUploading(false);
    }
  }, [updateSession]);

  // ── Save handlers ──────────────────────────────────────────────────────

  async function patchProfile(body: Record<string, unknown>) {
    const res = await fetch("/api/job-seeker/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Save failed");
    // Re-fetch via GET for consistent lean() shape used by the rest of the page
    await fetchProfile();
    return res.json();
  }

  async function handleSaveName() {
    if (!editName.trim()) return;
    setSavingName(true);
    try {
      await patchProfile({ name: editName.trim() });
      await updateSession({ name: editName.trim() });
      setShowNameModal(false);
    } catch { /* toast */ }
    finally { setSavingName(false); }
  }

  async function handleSaveHeadline() {
    setSavingHeadline(true);
    try {
      await patchProfile({ headline: editHeadline.trim() });
      setShowHeadlineModal(false);
    } catch { /* toast */ }
    finally { setSavingHeadline(false); }
  }

  async function handleSaveSummary() {
    setSavingSummary(true);
    try {
      await patchProfile({ summary: editSummary.trim() });
      setShowSummaryModal(false);
    } catch { /* toast */ }
    finally { setSavingSummary(false); }
  }

  async function handleSaveVisibility() {
    setSavingVisibility(true);
    try {
      await patchProfile({ profileVisibility: editVisibility });
      setShowVisibilityModal(false);
    } catch { /* toast */ }
    finally { setSavingVisibility(false); }
  }

  async function handleToggleSectionVisibility(sectionId: string, visible: boolean) {
    const prev = profile?.sectionVisibility ?? {};
    const updated = { ...prev, [sectionId]: visible };
    setProfile((p) => p ? { ...p, sectionVisibility: updated } : p);
    try {
      await patchProfile({ sectionVisibility: updated });
    } catch {
      setProfile((p) => p ? { ...p, sectionVisibility: prev } : p);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────

  const name      = session?.user?.name  ?? "Job Seeker";
  const email     = session?.user?.email ?? "";
  const displayAvatar = avatarUrl || session?.user?.image || "";
  const initials  = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // Compute completeness live from actual profile fields (same formula as the API)
  // so it's always up-to-date without needing a DB round-trip or re-upload.
  const completeness = profile ? Math.min(100, [
    profile.userId                                                           ? 10 : 0,
    profile.nationality                                                      ? 10 : 0,
    profile.currentLocation                                                  ? 5  : 0,
    profile.summary                                                          ? 10 : 0,
    (profile.skills?.length ?? 0) > 0                                       ? 20 : 0,
    (profile.experience?.length ?? 0) > 0                                   ? 20 : 0,
    (profile.education?.length ?? 0) > 0                                    ? 15 : 0,
    (profile.languages?.length ?? 0) > 0                                    ? 5  : 0,
    (profile.linkedin || profile.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin")) ? 5 : 0,
  ].reduce((a, b) => a + b, 0)) : 0;
  const checklist       = buildChecklist(profile, {
    cv: t("checklist.cv"),
    skills: t("checklist.skills"),
    experience: t("checklist.experience"),
    education: t("checklist.education"),
    personal: t("checklist.personal"),
    preferences: t("checklist.preferences"),
  });
  const missingSteps    = checklist.filter((s) => !s.done);
  const doneSteps       = checklist.filter((s) => s.done);
  const potentialBoost  = missingSteps.reduce((acc, s) => acc + parseInt(s.bonus), 0);
  const hasCv = !!(profile?.cvFileUrl || profile?.cv?.originalUrl);
  const aiExtracted = !!profile?.cvExtractedByAI;

  // ── Detailed missing-fields for reaching 100% ────────────────────────
  const missingFields: { label: string; points: number; href: string; icon: React.ElementType }[] = profile ? [
    ...(!profile.nationality     ? [{ label: "Add nationality",       points: 10, href: "./cv",                        icon: Globe }] : []),
    ...(!profile.currentLocation ? [{ label: "Add current location",  points: 5,  href: "./cv",                        icon: MapPin }] : []),
    ...(!profile.summary         ? [{ label: "Write a summary",       points: 10, href: "#about",                      icon: User }] : []),
    ...((profile.skills?.length ?? 0) === 0     ? [{ label: "Add skills",          points: 20, href: "./cv",                      icon: Award }] : []),
    ...((profile.experience?.length ?? 0) === 0 ? [{ label: "Add experience",      points: 20, href: "./cv",                      icon: Briefcase }] : []),
    ...((profile.education?.length ?? 0) === 0  ? [{ label: "Add education",       points: 15, href: "./cv",                      icon: GraduationCap }] : []),
    ...((profile.languages?.length ?? 0) === 0  ? [{ label: "Add languages",       points: 5,  href: "./profile/personal-details", icon: LanguagesIcon }] : []),
    ...(!(profile.linkedin || profile.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin"))
      ? [{ label: "Add LinkedIn profile", points: 5, href: "./cv",                      icon: Linkedin }] : []),
  ] : [];

  const completenessColor     = completeness >= 80 ? "text-emerald-600" : completeness >= 50 ? "text-amber-500" : "text-rose-500";
  const completenessRingColor = completeness >= 80 ? "stroke-emerald-500" : completeness >= 50 ? "stroke-amber-500" : "stroke-rose-500";

  const visibility = profile?.profileVisibility ?? "visible";
  const totalExpYears = profile?.totalExperienceYears ?? 0;
  const totalExpMonths = profile?.totalExperienceMonths ?? 0;
  const hasExperience = totalExpYears > 0 || totalExpMonths > 0;
  const availabilityLabel = {
    immediately: "Available immediately",
    within_month: "Available within 1 month",
    within_3_months: "Available within 3 months",
    not_available: "Not looking currently",
  }[profile?.availabilityStatus ?? ""] ?? "";

  const lastUpdated = profile?.updatedAt
    ? new Date(profile.updatedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : "";

  // Quick links for sidebar
  const sectionRefs = [
    { id: "about", label: t("sectionNav.about"), icon: User },
    { id: "experience", label: t("sectionNav.experience"), icon: Briefcase },
    { id: "skills", label: t("sectionNav.skills"), icon: Award },
    { id: "education", label: t("sectionNav.education"), icon: GraduationCap },
    { id: "projects", label: t("sectionNav.projects"), icon: FolderKanban },
    { id: "accomplishments", label: t("sectionNav.accomplishments"), icon: Trophy },
    { id: "career-profile", label: t("sectionNav.careerProfile"), icon: Building2 },
    { id: "languages", label: t("sectionNav.languages"), icon: LanguagesIcon },
  ];

  // Scroll-spy: highlight active section in Quick Links
  const [activeSection, setActiveSection] = useState<string>("");
  const clickLockRef = useRef<string | null>(null);
  useEffect(() => {
    const ids = sectionRefs.map((s) => s.id);
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (elements.length === 0) return;
    const visibleSet = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSet.set(entry.target.id, entry);
          } else {
            visibleSet.delete(entry.target.id);
          }
        }
        // If click-locked, keep that section active while it's visible
        if (clickLockRef.current && visibleSet.has(clickLockRef.current)) return;
        clickLockRef.current = null;
        // Pick the topmost visible section (by document order)
        for (const id of ids) {
          if (visibleSet.has(id)) {
            setActiveSection(id);
            return;
          }
        }
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return (
      <div className="px-3 py-4 sm:p-6 max-w-5xl mx-auto space-y-3 sm:space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-base p-4 sm:p-5 animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 py-4 sm:p-6 max-w-5xl mx-auto space-y-3 sm:space-y-4">

      {/* ── Page Header ────────────────────────────────────────────────── */}
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push("./settings")} aria-label={t("settings")}>
            <Settings className="w-4 h-4 me-1.5" />
            {t("settings")}
          </Button>
        }
      />

      <div
        className="card-base border-primary/15 p-5 sm:p-6"
        style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--accent)) 100%)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("aiTools")}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-foreground sm:text-xl">{t("aiTitle")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t("aiDescription")}
            </p>
          </div>

          <div className="lg:w-[17rem]">
            <button
              onClick={() => router.push("./cv")}
              aria-label={aiExtracted ? t("refreshCvAi") : t("uploadCvAi")}
              className="group w-full rounded-2xl border border-border/60 bg-background/90 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px] font-medium">
                  {aiExtracted ? t("aiReady") : hasCv ? t("cvUploaded") : t("new")}
                </Badge>
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">{t("aiExtractor")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {aiExtracted
                  ? t("aiExtractedDescription")
                  : hasCv
                    ? t("cvUploadedDescription")
                    : t("noCvDescription")}
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {aiExtracted ? t("refreshWithAi") : t("uploadCvAi")}
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── Profile Visibility Banner ─────────────────────────────────── */}
      <button
        onClick={() => { setEditVisibility(visibility); setShowVisibilityModal(true); }}
        className={cn(
          "w-full card-base px-4 py-2.5 flex items-center justify-between text-sm transition-colors",
          visibility === "visible"
            ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20"
        )}
      >
        <div className="flex items-center gap-2">
          {visibility === "visible" ? (
            <Eye className="w-4 h-4 text-emerald-600" />
          ) : (
            <EyeOff className="w-4 h-4 text-amber-600" />
          )}
          <span className={visibility === "visible" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
            {visibility === "visible" ? t("visibleBanner") : t("hiddenBanner")}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* ── Profile Header Card ─────────────────────────────────────────── */}
      <div className="card-base p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Avatar with upload overlay */}
          <div className="relative shrink-0 group">
            <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-background shadow-sm">
              <AvatarImage src={displayAvatar} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xl sm:text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Camera overlay */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label={t("a11yChangePhoto")}
              title={t("a11yChangePhoto")}
            >
              {avatarUploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            {completeness >= 80 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                <CheckCircle2 className="w-3 h-3 text-white" />
              </span>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold">{name}</h2>
              <button
                onClick={() => { setEditName(name); setShowNameModal(true); }}
                className="p-1 rounded-md hover:bg-muted transition-colors"
                aria-label={t("a11yEditName")}
                title={t("a11yEditName")}
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              {profile?.badges?.map((b) => (
                <Badge key={b} variant="secondary" className="text-xs gap-1">
                  <Award className="w-3 h-3" />{b}
                </Badge>
              ))}
              {profile?.cvExtractedByAI && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1 text-xs">
                  <Sparkles className="w-3 h-3" /> AI extracted
                </Badge>
              )}
            </div>

            {/* Headline */}
            <div className="flex items-center gap-1.5 mt-1">
              {profile?.headline ? (
                <p className="text-sm font-medium text-foreground/80">{profile.headline}</p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">Add a headline</p>
              )}
              <button
                onClick={() => { setEditHeadline(profile?.headline ?? ""); setShowHeadlineModal(true); }}
                className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
                aria-label={t("a11yEditHeadline")}
                title={t("a11yEditHeadline")}
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>

            {/* Summary */}
            <div className="flex items-start gap-1.5 mt-1">
              {profile?.summary ? (
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{profile.summary}</p>
              ) : (
                <button
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                  className="inline-flex items-center gap-1.5 text-sm text-primary/80 italic hover:text-primary transition-colors disabled:opacity-60"
                >
                  {generatingSummary ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Generating summary…</>
                  ) : (
                    <><Sparkles className="w-3 h-3" /> Generate summary with AI</>
                  )}
                </button>
              )}
              <button
                onClick={() => { setEditSummary(profile?.summary ?? ""); setShowSummaryModal(true); }}
                className="p-0.5 rounded hover:bg-muted transition-colors shrink-0 mt-0.5"
                title={t("a11yEditSummary")}
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>

            {/* Meta info row */}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {email && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" /> {email}
                </span>
              )}
              {profile?.currentLocation && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {profile.currentLocation}
                </span>
              )}
              {profile?.nationality && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {profile.nationality}
                </span>
              )}
              {hasExperience && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {totalExpYears > 0 && `${totalExpYears} yr${totalExpYears !== 1 ? "s" : ""}`}
                  {totalExpYears > 0 && totalExpMonths > 0 && " "}
                  {totalExpMonths > 0 && `${totalExpMonths} mo`}
                </span>
              )}
              {availabilityLabel && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {availabilityLabel}
                </span>
              )}
            </div>

            {/* Avatar actions + last updated */}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {displayAvatar && (
                <button
                  onClick={handleAvatarRemove}
                  disabled={avatarUploading}
                  className="text-xs text-rose-500 hover:text-rose-600 hover:underline"
                >
                  Remove photo
                </button>
              )}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="text-xs text-primary hover:underline"
              >
                {displayAvatar ? "Change photo" : "Upload photo"}
              </button>
              {lastUpdated && (
                <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Updated {lastUpdated}
                </span>
              )}
            </div>
            {avatarError && <p className="text-xs text-destructive mt-1">{avatarError}</p>}
          </div>

          {/* Completion ring — desktop only */}
          <div className="hidden sm:flex shrink-0 flex-col items-center gap-2">
            <div className="relative w-[72px] h-[72px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor"
                  strokeWidth="5" className="text-muted/20" />
                <circle cx="36" cy="36" r="30" fill="none" strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 30}`}
                  strokeDashoffset={`${2 * Math.PI * 30 * (1 - completeness / 100)}`}
                  strokeLinecap="round"
                  className={cn("transition-all duration-700", completenessRingColor)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-px">
                <span className={cn("text-base font-bold leading-none", completenessColor)}>{completeness}%</span>
                <span className="text-[9px] text-muted-foreground leading-none">complete</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {missingSteps.length === 0 && completeness < 100
                ? `${missingFields.length} detail${missingFields.length !== 1 ? "s" : ""} left`
                : `${doneSteps.length}/${checklist.length} steps done`}
            </span>
          </div>
        </div>

        {/* Mobile: compact progress bar */}
        <div className="sm:hidden mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Profile completion</span>
            <span className={cn("font-semibold", completenessColor)}>
              {completeness}% · {missingSteps.length === 0 && completeness < 100
                ? `${missingFields.length} detail${missingFields.length !== 1 ? "s" : ""} left`
                : `${doneSteps.length}/${checklist.length} steps`}
            </span>
          </div>
          <Progress value={completeness} className="h-1.5" />
          {/* Mobile: missing fields hints */}
          {missingFields.length > 0 && missingSteps.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {missingFields.map((field) => (
                <button
                  key={field.label}
                  onClick={() => {
                    if (field.href.startsWith("#")) {
                      document.getElementById(field.href.slice(1))?.scrollIntoView({ behavior: "smooth" });
                    } else {
                      router.push(field.href);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                >
                  <field.icon className="w-2.5 h-2.5" />
                  {field.label}
                  <span className="font-semibold">+{field.points}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Insight Card ───────────────────────────────────────────── */}
      {completeness < 80 && (
        <div className="card-base p-5 sm:p-6 border-violet-200 dark:border-violet-800/40"
          style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(270 60% 98%) 100%)" }}>
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/50">
              <BrainCircuit className="w-4.5 h-4.5 text-violet-600" style={{ width: "18px", height: "18px" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold">AI Career Insight</span>
                <span className="inline-flex items-center rounded-full bg-violet-600 px-1.5 py-px text-[10px] font-bold text-white tracking-wide">
                  SMART
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Complete your profile to boost your job match score by{" "}
                <span className={cn("font-bold", completeness < 50 ? "text-rose-600" : "text-amber-600")}>+{potentialBoost}%</span>.
                {" "}Profiles with a resume get <span className="font-semibold text-foreground">3× more interviews</span>.
              </p>
              {missingSteps.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {missingSteps.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => router.push(s.href)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-muted-foreground" />
                      {s.label}
                      <span className="text-emerald-600 font-semibold">{s.bonus}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Missing Details CTA (Naukri-style) ────────────────────────── */}
      {missingSteps.length > 0 && completeness < 100 && (
        <div className="card-base p-4 flex items-center justify-between">
          <div className="flex flex-wrap gap-3">
            {missingSteps.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(s.href)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <s.icon className="w-3.5 h-3.5" />
                <span>{s.label}</span>
                <span className="text-emerald-600 font-semibold">{s.bonus}</span>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0 text-xs"
            onClick={() => router.push(missingSteps[0]?.href ?? "./cv")}
          >
            Add {missingSteps.length} missing detail{missingSteps.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* ── Main Content with Quick Links Sidebar ─────────────────────── */}
      <div className="flex gap-4">
        {/* Quick Links Sidebar — desktop only */}
        <div className="hidden lg:block w-48 shrink-0 self-stretch">
          <div className="card-base p-3 sticky top-24">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick links</p>
            <nav className="space-y-0.5">
              {sectionRefs.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    clickLockRef.current = s.id;
                    setActiveSection(s.id);
                    document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors",
                    activeSection === s.id
                      ? "text-primary font-semibold bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        {/* Profile Sections */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* ── Setup Checklist ─────────────────────────────────────────── */}
          {completeness < 100 && (
            <div className="card-base p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold">Profile Setup</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {doneSteps.length} of {checklist.length} complete
                </span>
              </div>

              <div className="space-y-1">
                {checklist.map((step, idx) => (
                  <button
                    key={step.id}
                    onClick={() => !step.done && router.push(step.href)}
                    disabled={step.done}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      step.done ? "cursor-default" : "hover:bg-muted/60 cursor-pointer",
                      idx === 0 && !step.done && "bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    {step.done
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      : <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    }
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      step.done ? "bg-emerald-100 dark:bg-emerald-950/30" : idx === 0 ? "bg-primary/10" : "bg-muted"
                    )}>
                      <step.icon className={cn("w-3.5 h-3.5", step.done ? "text-emerald-600" : idx === 0 ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <span className={cn(
                      "flex-1 text-sm font-medium",
                      step.done ? "text-muted-foreground" : "text-foreground"
                    )}>
                      {step.label}
                    </span>
                    <span className={cn(
                      "text-xs font-semibold tabular-nums",
                      step.done ? "text-emerald-500" : idx === 0 ? "text-primary" : "text-amber-500"
                    )}>
                      {step.done ? "✓ Done" : step.bonus}
                    </span>
                    {!step.done && (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border/50">
                <Progress value={completeness} className="h-1.5" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>Overall progress</span>
                  <span>{completeness}%</span>
                </div>
              </div>

              {/* ── Missing fields to reach 100% ──────────────────────── */}
              {missingFields.length > 0 && missingSteps.length === 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-foreground">
                      Add these to reach 100%
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      (+{missingFields.reduce((a, f) => a + f.points, 0)}% remaining)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missingFields.map((field) => (
                      <button
                        key={field.label}
                        onClick={() => {
                          if (field.href.startsWith("#")) {
                            document.getElementById(field.href.slice(1))?.scrollIntoView({ behavior: "smooth" });
                          } else {
                            router.push(field.href);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                      >
                        <field.icon className="w-3 h-3" />
                        {field.label}
                        <span className="font-semibold">+{field.points}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Mixed: some checklist steps + extra fields missing ── */}
              {missingFields.length > 0 && missingSteps.length > 0 && missingFields.some(f =>
                !missingSteps.some(s =>
                  (s.id === "skills" && f.label === "Add skills") ||
                  (s.id === "experience" && f.label === "Add experience") ||
                  (s.id === "education" && f.label === "Add education") ||
                  (s.id === "personal" && (f.label === "Add nationality" || f.label === "Add current location"))
                )
              ) && (
                <div className="mt-3 px-3">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium">Tip:</span>{" "}
                    {missingFields.filter(f =>
                      !missingSteps.some(s =>
                        (s.id === "skills" && f.label === "Add skills") ||
                        (s.id === "experience" && f.label === "Add experience") ||
                        (s.id === "education" && f.label === "Add education") ||
                        (s.id === "personal" && (f.label === "Add nationality" || f.label === "Add current location"))
                      )
                    ).map(f => `${f.label} (+${f.points}%)`).join(", ")}{" "}
                    to boost your profile further.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── About ─────────────────────────────────────────────────── */}
          <div id="about" className="scroll-mt-24">
            <SectionCard icon={User} title={t("sectionAbout")} onEdit={() => { setEditSummary(profile?.summary ?? ""); setShowSummaryModal(true); }} onAdd={() => router.push("./settings")} isEmpty={!profile?.summary} emptyLabel={t("emptyAddSummary")}>
              {profile?.summary && <p className="text-sm text-muted-foreground leading-relaxed">{profile.summary}</p>}
            </SectionCard>
          </div>

          {/* ── Experience ────────────────────────────────────────────── */}
          <div id="experience" className="scroll-mt-24">
            <SectionCard icon={Briefcase} title={t("sectionExperience")} onAdd={() => router.push("./experience")} isEmpty={(profile?.experience?.length ?? 0) === 0} emptyLabel={t("emptyAddWorkExperience")} visible={profile?.sectionVisibility?.experience !== false} onToggleVisibility={(v) => handleToggleSectionVisibility("experience", v)}>
              {(profile?.experience?.length ?? 0) > 0 && (
                <div className="space-y-4">
                  {profile!.experience.map((exp, i) => (
                    <div key={i} className={cn("", i < profile!.experience.length - 1 && "pb-4 border-b border-border/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{exp.jobTitle}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{exp.company}{exp.location && ` · ${exp.location}`}</p>
                          <p className="text-xs text-muted-foreground">{exp.from} – {exp.current ? "Present" : exp.to}</p>
                        </div>
                        {exp.current && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0">Current</Badge>}
                      </div>
                      {exp.description && <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-3">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Skills ────────────────────────────────────────────────── */}
          <div id="skills" className="scroll-mt-24">
            <SectionCard icon={Award} title={t("sectionSkills")} onAdd={() => router.push("./skills")} isEmpty={(profile?.skills?.length ?? 0) === 0} emptyLabel={t("emptyAddSkills")} visible={profile?.sectionVisibility?.skills !== false} onToggleVisibility={(v) => handleToggleSectionVisibility("skills", v)}>
              {(profile?.skills?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile!.skills.map((s, i) => {
                    const skillName = typeof s === "string" ? s : s.name;
                    const years = typeof s === "string" ? 0 : s.yearsOfExperience;
                    return (
                      <Badge key={i} variant="secondary" className="px-3 py-1 text-sm">
                        {skillName}
                        {years > 0 && <span className="ms-1.5 text-xs text-muted-foreground">{years}y</span>}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Education ─────────────────────────────────────────────── */}
          <div id="education" className="scroll-mt-24">
            <SectionCard icon={GraduationCap} title={t("sectionEducation")} onAdd={() => router.push("./cv")} isEmpty={(profile?.education?.length ?? 0) === 0} emptyLabel={t("emptyAddEducation")} visible={profile?.sectionVisibility?.education !== false} onToggleVisibility={(v) => handleToggleSectionVisibility("education", v)}>
              {(profile?.education?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  {profile!.education.map((edu, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                        <GraduationCap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{edu.degree} in {edu.field}</p>
                        <p className="text-xs text-muted-foreground">{edu.institution}{edu.country && ` · ${edu.country}`}</p>
                        {edu.from && <p className="text-xs text-muted-foreground">{edu.from} – {edu.to}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Projects (NEW) ────────────────────────────────────────── */}
          <div id="projects" className="scroll-mt-24">
            <SectionCard icon={FolderKanban} title={t("sectionProjects")} onAdd={() => router.push("./cv")} isEmpty={(profile?.projects?.length ?? 0) === 0} emptyLabel={t("emptyAddProjects")} visible={profile?.sectionVisibility?.projects !== false} onToggleVisibility={(v) => handleToggleSectionVisibility("projects", v)}>
              {(profile?.projects?.length ?? 0) > 0 && (
                <div className="space-y-4">
                  {profile!.projects!.map((proj, i) => (
                    <div key={i} className={cn("", i < profile!.projects!.length - 1 && "pb-4 border-b border-border/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{proj.title}</p>
                          {proj.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{proj.description}</p>
                          )}
                          {proj.techStack?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {proj.techStack.map((t, j) => (
                                <Badge key={j} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {proj.repoUrl && (
                            <a href={proj.repoUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted">
                              <Github className="w-3.5 h-3.5 text-muted-foreground" />
                            </a>
                          )}
                          {proj.projectUrl && (
                            <a href={proj.projectUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted">
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            </a>
                          )}
                          {proj.isCurrent && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Active</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Accomplishments (NEW) ─────────────────────────────────── */}
          <div id="accomplishments" className="scroll-mt-24">
            <SectionCard icon={Trophy} title={t("sectionAccomplishments")} onAdd={() => router.push("./cv")} isEmpty={(profile?.accomplishments?.length ?? 0) === 0 && (profile?.certifications?.length ?? 0) === 0} emptyLabel={t("emptyAddAccomplishments")} visible={profile?.sectionVisibility?.accomplishments !== false} onToggleVisibility={(v) => handleToggleSectionVisibility("accomplishments", v)}>
              <div className="space-y-4">
                {/* Certifications */}
                {(profile?.certifications?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Certifications</p>
                    <div className="flex flex-wrap gap-2">
                      {profile!.certifications.map((c, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 text-xs"><Award className="w-3 h-3" />{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {/* Accomplishments by type */}
                {(profile?.accomplishments?.length ?? 0) > 0 && (
                  <>
                    {["online_profile", "work_sample", "publication", "presentation", "patent", "certification"].map((type) => {
                      const items = profile!.accomplishments!.filter((a) => a.type === type);
                      if (items.length === 0) return null;
                      const typeLabels: Record<string, string> = {
                        online_profile: "Online Profiles",
                        work_sample: "Work Samples",
                        publication: "Publications",
                        presentation: "Presentations",
                        patent: "Patents",
                        certification: "Certifications",
                      };
                      return (
                        <div key={type}>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{typeLabels[type]}</p>
                          <div className="space-y-1.5">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                {item.url ? (
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{item.title}</a>
                                ) : (
                                  <span className="text-sm text-foreground truncate">{item.title}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </SectionCard>
          </div>

          {/* ── Career Profile (NEW) ──────────────────────────────────── */}
          <div id="career-profile" className="scroll-mt-24">
            <SectionCard icon={Building2} title="Career Profile" onAdd={() => router.push("./preferences")} isEmpty={!profile?.careerProfile} emptyLabel="Add your career preferences — industry, role, desired job type">
              {profile?.careerProfile && (
                <div className="grid grid-cols-2 gap-4">
                  {profile.careerProfile.currentIndustry && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Current industry</p>
                      <p className="text-sm font-medium">{profile.careerProfile.currentIndustry}</p>
                    </div>
                  )}
                  {profile.careerProfile.department && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Department</p>
                      <p className="text-sm font-medium">{profile.careerProfile.department}</p>
                    </div>
                  )}
                  {profile.careerProfile.roleCategory && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Role category</p>
                      <p className="text-sm font-medium">{profile.careerProfile.roleCategory}</p>
                    </div>
                  )}
                  {profile.careerProfile.jobRole && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Job role</p>
                      <p className="text-sm font-medium">{profile.careerProfile.jobRole}</p>
                    </div>
                  )}
                  {profile.careerProfile.desiredJobType && profile.careerProfile.desiredJobType.length > 0 && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Desired job type</p>
                      <p className="text-sm font-medium">{profile.careerProfile.desiredJobType.join(", ")}</p>
                    </div>
                  )}
                  {profile.careerProfile.desiredEmploymentType && profile.careerProfile.desiredEmploymentType.length > 0 && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Employment type</p>
                      <p className="text-sm font-medium">{profile.careerProfile.desiredEmploymentType.join(", ")}</p>
                    </div>
                  )}
                  {profile.careerProfile.preferredShift && (
                    <div>
                      <p className="text-[11px] text-muted-foreground">Preferred shift</p>
                      <p className="text-sm font-medium capitalize">{profile.careerProfile.preferredShift}</p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Languages & Links ─────────────────────────────────────── */}
          <div id="languages" className="scroll-mt-24">
            <SectionCard
              icon={LanguagesIcon}
              title={t("languagesSection.title")}
              onAdd={() => router.push("./profile/personal-details")}
              isEmpty={(profile?.languages?.length ?? 0) === 0 && !(profile?.socialLinks?.length) && !profile?.linkedin && !profile?.portfolio}
              emptyLabel={t("languagesSection.empty")}
            >
              <div className="space-y-4">
                {(profile?.languages?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("languagesSection.languages")}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/40">
                            <th className="text-start py-1.5 font-medium">{t("languagesSection.language")}</th>
                            <th className="text-start py-1.5 font-medium">{t("languagesSection.proficiency")}</th>
                            <th className="text-center py-1.5 font-medium">{t("languagesSection.read")}</th>
                            <th className="text-center py-1.5 font-medium">{t("languagesSection.write")}</th>
                            <th className="text-center py-1.5 font-medium">{t("languagesSection.speak")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profile!.languages.map((l, i) => (
                            <tr key={i} className="border-b border-border/20 last:border-0">
                              <td className="py-1.5 font-medium capitalize">{l.language}</td>
                              <td className="py-1.5 capitalize text-muted-foreground">{l.level}</td>
                              <td className="py-1.5 text-center">{l.canRead !== false ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : "—"}</td>
                              <td className="py-1.5 text-center">{l.canWrite !== false ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : "—"}</td>
                              <td className="py-1.5 text-center">{l.canSpeak !== false ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {(() => {
                  // Merge legacy fields + socialLinks array
                  const links: { label: string; url: string }[] = [];
                  if (profile?.linkedin) links.push({ label: "LinkedIn", url: profile.linkedin });
                  if (profile?.portfolio) links.push({ label: "Portfolio", url: profile.portfolio });
                  if (profile?.socialLinks?.length) {
                    for (const sl of profile.socialLinks) {
                      if (sl.url && !links.some((l) => l.url === sl.url)) {
                        links.push(sl);
                      }
                    }
                  }
                  return links.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</p>
                      <div className="flex flex-wrap gap-4">
                        {links.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                            {link.label.toLowerCase() === "linkedin" ? <Linkedin className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <div className="card-base p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold">{t("quickActions.title")}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <QuickAction icon={FileText}  label={t("quickActions.aiCv")}       description={t("quickActions.aiCvDescription")}       onClick={() => router.push("./cv")}          primary />
          <QuickAction icon={Award}     label={t("quickActions.addSkills")}  description={t("quickActions.addSkillsDescription")}  onClick={() => router.push("./cv")}                  />
          <QuickAction icon={Target}    label={t("quickActions.preferences")} description={t("quickActions.preferencesDescription")} onClick={() => router.push("./preferences")}         />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*   MODALS                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}

      {/* ── Edit Name Modal ──────────────────────────────────────────── */}
      <Dialog open={showNameModal} onOpenChange={setShowNameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Name</DialogTitle>
            <DialogDescription className="sr-only">Update your display name</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveName(); }} className="space-y-3 py-2">
            <div>
              <Label htmlFor="editName">Full Name</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your full name"
                maxLength={200}
                autoFocus
              />
            </div>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveName} disabled={savingName || !editName.trim()}>
              {savingName ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Save className="w-4 h-4 me-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Headline Modal ──────────────────────────────────────── */}
      <Dialog open={showHeadlineModal} onOpenChange={setShowHeadlineModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Headline</DialogTitle>
            <DialogDescription className="sr-only">Update your professional headline</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveHeadline(); }} className="space-y-3 py-2">
            <div>
              <Label htmlFor="editHeadline">Resume Headline</Label>
              <Input
                id="editHeadline"
                value={editHeadline}
                onChange={(e) => setEditHeadline(e.target.value)}
                placeholder="e.g. Full Stack Developer with 3 years of experience"
                maxLength={200}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">A one-line summary that appears below your name</p>
            </div>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveHeadline} disabled={savingHeadline}>
              {savingHeadline ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Save className="w-4 h-4 me-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Summary Modal ───────────────────────────────────────── */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Professional Summary</DialogTitle>
            <DialogDescription className="sr-only">Update your professional summary</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="editSummary">About You</Label>
                <button
                  type="button"
                  onClick={async () => {
                    setGeneratingSummary(true);
                    try {
                      const res = await csrfFetch("/api/ai/generate-summary", { method: "POST" });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error ?? "Failed");
                      setEditSummary(data.summary);
                      setProfile((prev) => prev ? { ...prev, summary: data.summary } : prev);
                    } catch (e) { console.error(e); }
                    finally { setGeneratingSummary(false); }
                  }}
                  disabled={generatingSummary}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                >
                  {generatingSummary ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="w-3 h-3" /> Generate with AI</>
                  )}
                </button>
              </div>
              <Textarea
                id="editSummary"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Highlight your key career achievements to help employers know your potential"
                maxLength={2000}
                rows={5}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">{editSummary.length}/2000 characters</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveSummary} disabled={savingSummary}>
              {savingSummary ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Save className="w-4 h-4 me-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Profile Visibility Modal (Indeed-style) ──────────────────── */}
      <Dialog open={showVisibilityModal} onOpenChange={setShowVisibilityModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription className="sr-only">Manage your profile visibility settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <button
              onClick={() => setEditVisibility("visible")}
              className={cn(
                "w-full text-left rounded-lg border-2 p-4 transition-colors",
                editVisibility === "visible"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              {editVisibility === "visible" && (
                <span className="inline-block text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full mb-2">Recommended</span>
              )}
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Employers can find you on Mployedin</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Employers can find your profile through Mployedin and contact you about jobs.
                    We attempt to hide identifiable details until you respond to employers.
                  </p>
                </div>
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5",
                  editVisibility === "visible" ? "border-primary" : "border-muted-foreground/30"
                )}>
                  {editVisibility === "visible" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </div>
            </button>

            <button
              onClick={() => setEditVisibility("hidden")}
              className={cn(
                "w-full text-left rounded-lg border-2 p-4 transition-colors",
                editVisibility === "hidden"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div className="flex items-start gap-3">
                <EyeOff className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Employers can&apos;t find you on Mployedin</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only employers you&apos;ve applied to can see you on Mployedin.
                    Other employers can&apos;t find your profile or contact you about jobs.
                  </p>
                </div>
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center mt-0.5",
                  editVisibility === "hidden" ? "border-primary" : "border-muted-foreground/30"
                )}>
                  {editVisibility === "hidden" && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </div>
            </button>

            <a href="/privacy" target="_blank" className="text-xs text-primary hover:underline block mt-2">
              Privacy Policy
            </a>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSaveVisibility} disabled={savingVisibility}>
              {savingVisibility ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon, title, children, onAdd, onEdit, isEmpty, emptyLabel, visible, onToggleVisibility,
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  onAdd?: () => void;
  onEdit?: () => void;
  isEmpty: boolean;
  emptyLabel?: string;
  visible?: boolean;
  onToggleVisibility?: (v: boolean) => void;
}) {
  const t = useTranslations("jobSeekerExtra.profile");

  return (
    <div className="card-base p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleVisibility && (
            <button
              onClick={() => onToggleVisibility(!visible)}
              className={cn(
                "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors",
                visible !== false
                  ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              )}
              title={visible !== false ? t("sectionActions.visibleTitle") : t("sectionActions.hiddenTitle")}
            >
              {visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {visible !== false ? t("sectionActions.visible") : t("sectionActions.hidden")}
            </button>
          )}
          {onEdit && !isEmpty && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              <Pencil className="w-3 h-3" />
              {t("sectionActions.edit")}
            </button>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              <Plus className="w-3.5 h-3.5" />
              {isEmpty ? t("sectionActions.add") : t("sectionActions.update")}
            </button>
          )}
        </div>
      </div>

      {/* Content or empty state */}
      {isEmpty ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            {onAdd && (
              <button onClick={onAdd} className="text-xs text-primary hover:underline mt-0.5 block">
                {t("sectionActions.uploadToAutofill")} →
              </button>
            )}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function QuickAction({
  icon: Icon, label, description, onClick, primary,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all hover:shadow-sm w-full",
        primary ? "border-primary/30 bg-primary/5 hover:bg-primary/10" : "border-border/60 hover:bg-muted/40"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        primary ? "bg-primary/15 group-hover:bg-primary/20" : "bg-muted group-hover:bg-muted/70"
      )}>
        <Icon className={cn("w-4 h-4", primary ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 ms-auto group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}
