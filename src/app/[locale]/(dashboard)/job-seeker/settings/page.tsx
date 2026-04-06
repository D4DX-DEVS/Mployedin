"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Zap,
  Hand,
  CalendarDays,
  DollarSign,
  Bell,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  MapPin,
  Gauge,
  Sparkles,
  BrainCircuit,
  Camera,
  Trash2,
  User,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/PageHeader";

// ─── Schema ───────────────────────────────────────────────────────────────────

const settingsFormSchema = z.object({
  autoApply: z.boolean(),
  autoApplyFilters: z.object({
    minScore: z.number().int().min(50).max(95),
    onlyVerifiedEmployers: z.boolean(),
  }),
  applySpeed: z.enum(["safe", "balanced", "aggressive"]),
  preferredJobTypes: z.array(z.string()),
  preferredLocations: z.array(z.string()),
  salaryMin: z.number().min(0).optional(),
  salaryMax: z.number().min(0).optional(),
  salaryCurrency: z.string(),
  instantBooking: z.boolean(),
  timeBuffer: z.number().int().min(0).max(120),
  weeklyAvailability: z.array(z.string()),
  showSalary: z.boolean(),
  openToRelocation: z.boolean(),
  defaultResumeId: z.string(),
  autoGenerateCoverLetter: z.boolean(),
  coverLetterTone: z.enum(["professional", "friendly", "bold"]),
  autoAnswerScreening: z.boolean(),
  notifications: z.object({
    jobMatchAlerts: z.boolean(),
    applicationSubmitted: z.boolean(),
    interviewNotifications: z.boolean(),
  }),
});

type SettingsForm = z.infer<typeof settingsFormSchema>;

// ─── Mock / static data ───────────────────────────────────────────────────────

const MOCK_RESUMES = [
  { id: "resume_v2", label: "Resume_v2.pdf" },
  { id: "resume_backend", label: "Resume_Backend.pdf" },
  { id: "resume_frontend", label: "Resume_Frontend.pdf" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CURRENCIES = ["USD", "AED", "SAR", "EGP", "KWD", "QAR", "BHD", "OMR"];

const SPEED_OPTIONS: { value: SettingsForm["applySpeed"]; label: string; desc: string }[] = [
  { value: "safe", label: "Safe", desc: "Only jobs ≥ 85% match" },
  { value: "balanced", label: "Balanced", desc: "Jobs ≥ 70% match" },
  { value: "aggressive", label: "Aggressive", desc: "Jobs ≥ 55% match" },
];

const JOB_TYPE_OPTIONS = ["Full-time", "Part-time", "Remote", "Contract", "Freelance"];

const MOCK_STATS = { applied: 23, interviews: 4 };

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULTS: SettingsForm = {
  autoApply: false,
  autoApplyFilters: { minScore: 70, onlyVerifiedEmployers: true },
  applySpeed: "balanced",
  preferredJobTypes: ["Full-time"],
  preferredLocations: [],
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: "USD",
  instantBooking: true,
  timeBuffer: 30,
  weeklyAvailability: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  showSalary: true,
  openToRelocation: true,
  defaultResumeId: "resume_v2",
  autoGenerateCoverLetter: true,
  coverLetterTone: "professional",
  autoAnswerScreening: false,
  notifications: {
    jobMatchAlerts: true,
    applicationSubmitted: true,
    interviewNotifications: true,
  },
};

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  show: boolean;
  type: "success" | "error";
  message: string;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-6 shadow-sm transition-colors ${
        highlight ? "border-primary/40 bg-primary/[0.02]" : "border-border"
      }`}
    >
      <div className="mb-5 flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${highlight ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  tooltip,
  children,
}: {
  label: string;
  description?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Expandable sub-section ───────────────────────────────────────────────────

function Expanded({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="pt-4 space-y-4 border-t border-dashed">{children}</div>
  );
}

// ─── Tag input ────────────────────────────────────────────────────────────────

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed) && values.length < 10) {
      onChange([...values, trimmed]);
      setInput("");
    }
  };

  const remove = (tag: string) => onChange(values.filter((v) => v !== tag));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder ?? "Type and press Enter"}
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 px-3">
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer text-xs gap-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => remove(tag)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="));
  return match?.split("=")[1] ?? "";
}

export default function JobSeekerSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, type: "success", message: "" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Avatar state ────────────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Sync avatar from session
  useEffect(() => {
    if (session?.user?.image) setAvatarUrl(session.user.image);
  }, [session?.user?.image]);

  const handleAvatarSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError("");

    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED.includes(file.type)) {
      setAvatarError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image must be under 2MB.");
      return;
    }

    // Immediate preview
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

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: DEFAULTS,
  });

  const { control, watch, handleSubmit, reset, formState } = form;
  const values = watch();
  const isDirty = formState.isDirty;

  // Load from API
  useEffect(() => {
    fetch("/api/job-seekers/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) reset({ ...DEFAULTS, ...d.settings });
      })
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, [reset]);

  const showToast = (type: "success" | "error", message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ show: true, type, message });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3500);
  };

  const onSubmit = async (data: SettingsForm) => {
    setSaving(true);
    try {
      const res = await fetch("/api/job-seekers/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: data }),
      });
      if (!res.ok) throw new Error("Failed to save");
      reset(data);
      showToast("success", "Settings saved successfully");
    } catch {
      showToast("error", "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="px-6 py-6 md:px-8 md:py-8">
        <div className="space-y-5 max-w-3xl">
        <div className="h-14 rounded-xl bg-muted animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <div className="flex gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 w-56 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-px bg-muted" />
            <div className="flex justify-between">
              <div className="h-3 w-40 rounded bg-muted animate-pulse" />
              <div className="h-5 w-10 rounded-full bg-muted animate-pulse" />
            </div>
          </div>
        ))}
        </div>
      </div>
    );
  }

  const userName = session?.user?.name ?? "";
  const userInitials = userName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "JS";

  return (
    <TooltipProvider>
      <div className="px-6 py-6 md:px-8 md:py-8">
      <form id="settings-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-3xl">

        <PageHeader
          title="Application Settings"
          description="Your AI-powered control panel — configure how MPLOYEDIN works for you"
        />

        {/* ── Profile Picture Card ─────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-5">
            {/* Avatar with upload overlay */}
            <div className="relative shrink-0">
              <Avatar className="h-20 w-20 ring-2 ring-border">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                  {avatarUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : userInitials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            {/* Info + buttons */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{userName || "Your Name"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{session?.user?.email ?? ""}</p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  ) : (
                    <><Camera className="h-3.5 w-3.5" /> {avatarUrl ? "Change Photo" : "Upload Photo"}</>
                  )}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleAvatarRemove}
                    disabled={avatarUploading}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              {avatarError && (
                <p className="mt-1.5 text-xs text-destructive">{avatarError}</p>
              )}
            </div>

            <div className="hidden sm:flex flex-col items-end gap-1 text-xs text-muted-foreground shrink-0">
              <p>Max 2MB</p>
              <p>JPEG, PNG, WebP</p>
            </div>
          </div>
        </div>

        {/* ── AI Status Banner ─────────────────────────────────────────────── */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            values.autoApply ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <span className="text-sm font-medium text-primary">AI is actively applying to jobs on your behalf</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{MOCK_STATS.applied}</span> applied this week
              <span className="text-border">·</span>
              <span className="font-semibold text-foreground">{MOCK_STATS.interviews}</span> interviews booked
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* A — Auto Apply Mode                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section
          icon={<Zap className="h-4 w-4" />}
          title="Auto Apply Mode"
          description="AI finds matching jobs and applies on your behalf — fully automated."
          highlight={values.autoApply}
        >
          <SettingRow
            label="Auto Apply Mode"
            description={
              values.autoApply
                ? "AI is applying to matching jobs automatically."
                : "Manual mode — you review and approve every application before sending."
            }
            tooltip="When enabled, AI automatically submits applications that meet your match threshold."
          >
            <Controller
              control={control}
              name="autoApply"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          {!values.autoApply && (
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">
              <Hand className="h-4 w-4 shrink-0" />
              Manual mode — you review and approve every application before sending.
            </div>
          )}

          <Expanded open={values.autoApply}>
            {/* Match Score */}
            <SettingRow
              label="Match Score Threshold"
              description={`AI only applies when match score ≥ ${values.autoApplyFilters.minScore}%`}
              tooltip="Higher threshold = fewer but more targeted applications."
            >
              <div className="flex items-center gap-3">
                <Controller
                  control={control}
                  name="autoApplyFilters.minScore"
                  render={({ field }) => (
                    <input
                      type="range"
                      min={50}
                      max={95}
                      step={5}
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      className="w-28 accent-primary"
                    />
                  )}
                />
                <span className="w-10 rounded-md bg-primary/10 px-2 py-0.5 text-center text-xs font-semibold text-primary">
                  {values.autoApplyFilters.minScore}%
                </span>
              </div>
            </SettingRow>

            {/* Apply Speed */}
            <SettingRow
              label="AI Apply Speed"
              description="Controls how aggressively AI selects jobs within your threshold."
              tooltip="Aggressive mode applies to more jobs but may include weaker fits."
            >
              <Controller
                control={control}
                name="applySpeed"
                render={({ field }) => (
                  <div className="flex gap-1.5">
                    {SPEED_OPTIONS.map((opt) => (
                      <Tooltip key={opt.value}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => field.onChange(opt.value)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                              field.value === opt.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            {opt.label}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">{opt.desc}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                )}
              />
            </SettingRow>

            {/* Preferred Job Types */}
            <div>
              <p className="mb-2 text-sm font-medium">Preferred Job Types</p>
              <Controller
                control={control}
                name="preferredJobTypes"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPE_OPTIONS.map((type) => {
                      const active = field.value.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              active ? field.value.filter((v) => v !== type) : [...field.value, type]
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* Preferred Locations */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Preferred Locations</p>
              </div>
              <Controller
                control={control}
                name="preferredLocations"
                render={({ field }) => (
                  <TagInput
                    values={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Dubai, London, Remote…"
                  />
                )}
              />
            </div>

            {/* Salary Range */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Salary Range</p>
              </div>
              <div className="flex gap-2">
                <Controller
                  control={control}
                  name="salaryMin"
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="Min"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      className="h-8 text-sm"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="salaryMax"
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="Max"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      className="h-8 text-sm"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="salaryCurrency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 w-24 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Only Verified Employers */}
            <SettingRow
              label="Only verified employers"
              description="Skip jobs from unverified companies."
              tooltip="Verified employers have confirmed their company domain."
            >
              <Controller
                control={control}
                name="autoApplyFilters.onlyVerifiedEmployers"
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </SettingRow>
          </Expanded>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* B — Interview Settings                                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section
          icon={<CalendarDays className="h-4 w-4" />}
          title="Interview Settings"
          description="Control how employers can schedule interviews with you."
        >
          <SettingRow
            label="Instant Interview Booking"
            description="Allow employers to book interviews directly into your available time slots."
          >
            <Controller
              control={control}
              name="instantBooking"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Expanded open={values.instantBooking}>
            {/* Google Calendar */}
            <SettingRow label="Google Calendar" description="Sync availability and receive calendar invites.">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button type="button" variant="outline" size="sm" disabled className="h-8 text-xs">
                      Connect Calendar
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Calendar integration coming soon
                </TooltipContent>
              </Tooltip>
            </SettingRow>

            {/* Weekly Availability */}
            <div>
              <p className="mb-2 text-sm font-medium">Weekly Availability</p>
              <Controller
                control={control}
                name="weeklyAvailability"
                render={({ field }) => (
                  <div className="flex gap-1.5">
                    {DAYS.map((day) => {
                      const active = field.value.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              active
                                ? field.value.filter((d) => d !== day)
                                : [...field.value, day]
                            )
                          }
                          className={`h-9 w-10 rounded-lg border text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            {/* Buffer */}
            <SettingRow
              label="Buffer Between Interviews"
              description="Minimum break time between back-to-back interviews."
              tooltip="Prevents employers from double-booking you too tightly."
            >
              <Controller
                control={control}
                name="timeBuffer"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 60].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m === 0 ? "No buffer" : `${m} min`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </SettingRow>
          </Expanded>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* C — Profile Preferences                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section
          icon={<Gauge className="h-4 w-4" />}
          title="Profile Preferences"
          description="Control what employers see on your public profile."
        >
          <SettingRow
            label="Show Salary Expectations"
            description="Display your salary range on your profile and applications."
          >
            <Controller
              control={control}
              name="showSalary"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Expanded open={values.showSalary}>
            <div className="flex gap-2">
              <Controller
                control={control}
                name="salaryMin"
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="Min salary"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    className="h-8 text-sm"
                  />
                )}
              />
              <Controller
                control={control}
                name="salaryMax"
                render={({ field }) => (
                  <Input
                    type="number"
                    placeholder="Max salary"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    className="h-8 text-sm"
                  />
                )}
              />
              <Controller
                control={control}
                name="salaryCurrency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-8 w-24 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </Expanded>

          <Separator />

          <SettingRow
            label="Open to Relocation"
            description="Signal to employers you're willing to relocate within the GCC."
          >
            <Controller
              control={control}
              name="openToRelocation"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Expanded open={values.openToRelocation}>
            <div>
              <p className="mb-2 text-sm font-medium">Preferred Relocation Cities</p>
              <Controller
                control={control}
                name="preferredLocations"
                render={({ field }) => (
                  <TagInput
                    values={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Dubai, Riyadh, Doha…"
                  />
                )}
              />
            </div>
          </Expanded>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* D — Resume & AI Behavior                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section
          icon={<BrainCircuit className="h-4 w-4" />}
          title="Resume & AI Behavior"
          description="Configure how AI writes on your behalf."
        >
          {/* Default Resume */}
          <SettingRow
            label="Default Resume"
            description="Used for all AI-generated applications."
            tooltip="Upload additional resumes from the Documents page."
          >
            <Controller
              control={control}
              name="defaultResumeId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-8 w-44 text-sm">
                    <SelectValue placeholder="Select resume" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOCK_RESUMES.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </SettingRow>

          <Separator />

          <SettingRow
            label="Auto-generate Cover Letters"
            description="AI writes a tailored cover letter for every application."
          >
            <Controller
              control={control}
              name="autoGenerateCoverLetter"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Expanded open={values.autoGenerateCoverLetter}>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Cover Letter Tone</p>
              </div>
              <Controller
                control={control}
                name="coverLetterTone"
                render={({ field }) => (
                  <div className="flex gap-2">
                    {(["professional", "friendly", "bold"] as const).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => field.onChange(tone)}
                        className={`rounded-lg border px-4 py-2 text-xs font-medium capitalize transition-colors ${
                          field.value === tone
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          </Expanded>

          <Separator />

          <SettingRow
            label="Auto-answer Screening Questions"
            description="AI fills in pre-screening questionnaires based on your profile."
            tooltip="AI uses your profile and resume to answer common screening questions. You can review answers before submitting in Manual mode."
          >
            <Controller
              control={control}
              name="autoAnswerScreening"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>
        </Section>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* E — Notifications                                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <Section
          icon={<Bell className="h-4 w-4" />}
          title="Notifications"
          description="Choose which activity triggers a notification."
        >
          <SettingRow label="Job Match Alerts" description="Notify me when new jobs match my profile.">
            <Controller
              control={control}
              name="notifications.jobMatchAlerts"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Separator />

          <SettingRow label="Application Submitted" description="Confirm each time an application is sent.">
            <Controller
              control={control}
              name="notifications.applicationSubmitted"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>

          <Separator />

          <SettingRow label="Interview Notifications" description="Reminders and updates about scheduled interviews.">
            <Controller
              control={control}
              name="notifications.interviewNotifications"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>
        </Section>

        {/* ── Save bar ── */}
        {isDirty && (
          <div className="rounded-xl border bg-card px-5 py-4 shadow-sm flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">You have unsaved changes</p>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => reset()}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="min-w-[100px]"
              >
                {saving ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </div>
        )}

      </form>
      </div>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-24 right-6 z-50 pointer-events-none transition-all duration-300 ${
          toast.show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm font-medium pointer-events-auto ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.message}
        </div>
      </div>

    </TooltipProvider>
  );
}
