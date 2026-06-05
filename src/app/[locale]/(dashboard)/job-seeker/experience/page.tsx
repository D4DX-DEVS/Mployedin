"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  X,
  Sparkles,
  ArrowLeft,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const EMPTY_EXPERIENCE: WorkExperience = {
  jobTitle: "",
  company: "",
  country: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  description: "",
};

/** Normalise any date string to YYYY-MM for <input type="month"> */
function toMonthInput(val: string | undefined | null): string {
  if (!val) return "";
  if (/^\d{4}-\d{2}$/.test(val)) return val;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 7);
  if (/^\d{4}$/.test(val)) return `${val}-01`;
  return "";
}

/** Format YYYY-MM to readable string */
function formatDate(val: string, locale: string): string {
  if (!val) return "";
  const [year, month] = val.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
}

/* ── Main Page ── */

export default function ExperiencePage() {
  const t = useTranslations("jobSeekerExtra.experience");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const router = useRouter();

  const [experiences, setExperiences] = useState<WorkExperience[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [enhancingIdx, setEnhancingIdx] = useState<number | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  /* ── Scroll to top on mount ── */
  useEffect(() => { window.scrollTo(0, 0); }, []);

  /* ── Load profile on mount ── */

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/job-seeker/profile");
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;

        if (Array.isArray(data.experience) && data.experience.length > 0) {
          setExperiences(
            data.experience.map((e: Record<string, unknown>) => ({
              jobTitle: (e.jobTitle as string) ?? "",
              company: (e.company as string) ?? "",
              country: (e.country as string) ?? (e.location as string) ?? "",
              startDate: toMonthInput(e.startDate as string),
              endDate: e.isCurrent ? "" : toMonthInput(e.endDate as string),
              isCurrent: (e.isCurrent as boolean) ?? false,
              description: (e.description as string) ?? "",
            })),
          );
        }
      } catch {
        // Silent — user can still add manually
      } finally {
        setProfileLoaded(true);
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 100);
      }
    }
    loadProfile();
  }, []);

  /* ── Debounced auto-save ── */

  useEffect(() => {
    if (!profileLoaded || isInitialLoadRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const payload = experiences
          .filter((e) => e.jobTitle.trim() || e.company.trim())
          .map((e) => ({
            jobTitle: e.jobTitle.trim(),
            company: e.company.trim(),
            country: e.country.trim(),
            startDate: e.startDate || undefined,
            endDate: e.isCurrent ? undefined : e.endDate || undefined,
            isCurrent: e.isCurrent,
            description: e.description.trim(),
          }));

        const res = await fetch("/api/job-seeker/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experience: payload }),
        });
        if (!res.ok) throw new Error("Save failed");
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
        toast.error("Failed to save experience. Please try again.");
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [experiences, profileLoaded]);

  /* ── Experience management ── */

  const addExperience = useCallback(() => {
    setExperiences((prev) => [{ ...EMPTY_EXPERIENCE }, ...prev]);
  }, []);

  const updateExperience = useCallback(
    (index: number, field: keyof WorkExperience, value: string | boolean) => {
      setExperiences((prev) =>
        prev.map((e, i) =>
          i === index
            ? {
                ...e,
                [field]: value,
                ...(field === "isCurrent" && value ? { endDate: "" } : {}),
              }
            : e,
        ),
      );
    },
    [],
  );

  const removeExperience = useCallback((index: number) => {
    setExperiences((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* ── AI Enhance description ── */

  const enhanceDescription = useCallback(
    async (index: number) => {
      const exp = experiences[index];
      if (!exp.jobTitle.trim() && !exp.description.trim()) {
        toast.error("Add a job title or description first.");
        return;
      }

      setEnhancingIdx(index);
      try {
        const res = await fetch("/api/ai/enhance-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: exp.description || `${exp.jobTitle} at ${exp.company}`,
            context: "work experience description for a professional resume",
            tone: "professional",
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Enhancement failed");
        }

        const data = await res.json();
        if (data.enhanced) {
          updateExperience(index, "description", data.enhanced);
          toast.success("Description enhanced!");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not enhance description.",
        );
      } finally {
        setEnhancingIdx(null);
      }
    },
    [experiences, updateExperience],
  );

  /* ── Stats ── */

  const totalYears = experiences.reduce((acc, exp) => {
    if (!exp.startDate) return acc;
    const start = new Date(exp.startDate + "-01");
    const end = exp.isCurrent
      ? new Date()
      : exp.endDate
        ? new Date(exp.endDate + "-01")
        : start;
    return acc + Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  }, 0);

  /* ── Render ── */

  return (
    <div className="page-container mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("./profile")}
          className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("saving")}
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> {t("saved")}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={addExperience} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {t("add")}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {experiences.length > 0 && (
        <div className="card-base mb-6 flex items-center gap-6 px-5 py-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{experiences.length.toLocaleString(numberLocale)}</span>
            <span className="text-xs text-muted-foreground">
              {experiences.length === 1 ? t("position") : t("positions")}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{totalYears.toLocaleString(numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            <span className="text-xs text-muted-foreground">{t("yearsTotal")}</span>
          </div>
          {experiences.some((e) => e.isCurrent) && (
            <>
              <div className="h-4 w-px bg-border" />
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                {t("currentlyEmployed")}
              </Badge>
            </>
          )}
        </div>
      )}

      {/* Loading */}
      {!profileLoaded && (
        <div className="card-base flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ms-2 text-sm text-muted-foreground">{t("loading")}</span>
        </div>
      )}

      {/* Empty state */}
      {profileLoaded && experiences.length === 0 && (
        <div className="card-base flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Briefcase className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-1">{t("emptyTitle")}</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-sm">
            {t("emptyDescription")}
          </p>
          <Button onClick={addExperience} className="gap-1.5">
            <Plus className="h-4 w-4" /> {t("addFirst")}
          </Button>
        </div>
      )}

      {/* Experience cards */}
      {profileLoaded && experiences.length > 0 && (
        <div className="space-y-4">
          {experiences.map((exp, i) => (
            <div
              key={i}
              className="card-base p-5 sm:p-6 space-y-4 relative group animate-in fade-in-0 slide-in-from-top-2 duration-300"
            >
              {/* Card header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {exp.isCurrent ? t("currentPosition") : t("positionNumber", { count: (i + 1).toLocaleString(numberLocale) })}
                  </span>
                  {exp.isCurrent && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                      {t("current")}
                    </Badge>
                  )}
                </div>
                <button
                  onClick={() => removeExperience(i)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title={t("remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("jobTitle")}</Label>
                  <Input
                    value={exp.jobTitle}
                    onChange={(e) => updateExperience(i, "jobTitle", e.target.value)}
                    placeholder={t("jobPlaceholder")}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("company")}</Label>
                  <Input
                    value={exp.company}
                    onChange={(e) => updateExperience(i, "company", e.target.value)}
                    placeholder={t("companyPlaceholder")}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("location")}</Label>
                  <Input
                    value={exp.country}
                    onChange={(e) => updateExperience(i, "country", e.target.value)}
                    placeholder={t("locationPlaceholder")}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("from")}</Label>
                  <Input
                    type="month"
                    value={exp.startDate}
                    onChange={(e) => updateExperience(i, "startDate", e.target.value)}
                    className="h-10"
                  />
                </div>
                {!exp.isCurrent ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("to")}</Label>
                    <Input
                      type="month"
                      value={exp.endDate}
                      onChange={(e) => updateExperience(i, "endDate", e.target.value)}
                      className="h-10"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("to")}</Label>
                    <div className="flex h-10 items-center text-sm text-muted-foreground px-3 border rounded-md bg-muted/30">
                      {t("present")}
                    </div>
                  </div>
                )}
              </div>

              {/* Currently work here */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exp.isCurrent}
                  onChange={(e) => updateExperience(i, "isCurrent", e.target.checked)}
                  className="rounded border-muted-foreground/40"
                  id={`current-${i}`}
                />
                <label htmlFor={`current-${i}`} className="text-xs text-muted-foreground cursor-pointer">
                  {t("currentWork")}
                </label>
              </div>

              {/* Description with AI enhance */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t("descriptionLabel")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => enhanceDescription(i)}
                    disabled={enhancingIdx !== null}
                    className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-primary px-2"
                  >
                    {enhancingIdx === i ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {t("aiEnhance")}
                  </Button>
                </div>
                <Textarea
                  value={exp.description}
                  onChange={(e) => updateExperience(i, "description", e.target.value)}
                  placeholder={t("descriptionPlaceholder")}
                  rows={3}
                  className="resize-none text-sm"
                />
                {exp.description && (
                  <p className="text-[10px] text-muted-foreground text-right">
                    {exp.description.length} / 2000
                  </p>
                )}
              </div>

              {/* Duration badge */}
              {exp.startDate && (
                <div className="pt-1 border-t border-border/40">
                  <span className="text-[10px] text-muted-foreground">
                    {t("duration")} {formatDate(exp.startDate, locale)} – {exp.isCurrent ? t("present") : exp.endDate ? formatDate(exp.endDate, locale) : "—"}
                    {(() => {
                      const start = new Date(exp.startDate + "-01");
                      const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate + "-01") : null;
                      if (!end) return "";
                      const months = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
                      const y = Math.floor(months / 12);
                      const m = months % 12;
                      return ` · ${y > 0 ? `${y}y ` : ""}${m}m`;
                    })()}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Add more button at bottom */}
          <button
            onClick={addExperience}
            className="w-full card-base flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t("addAnother")}
          </button>
        </div>
      )}
    </div>
  );
}
