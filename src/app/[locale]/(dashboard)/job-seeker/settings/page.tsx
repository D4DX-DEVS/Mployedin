"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
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
  Sparkles,
  BrainCircuit,
  Camera,
  Trash2,
  ShieldCheck,
  FileText,
  Settings2,
  Save,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToastState {
  show: boolean;
  type: "success" | "error";
  message: string;
}

// ─── Setting Row ──────────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
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

// ─── Card Block ───────────────────────────────────────────────────────────────

function SettingCard({
  icon,
  title,
  description,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border bg-card shadow-sm overflow-hidden ${accent ? "border-primary/30" : "border-border/60"}`}>
      <div className={`px-5 pt-5 pb-4 flex items-start gap-3 ${accent ? "bg-primary/[0.03]" : ""}`}>
        <div className={`rounded-xl p-2.5 shrink-0 ${accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Separator />
      <div className="px-5 py-2 divide-y divide-border/50">{children}</div>
    </div>
  );
}

// ─── Tag Input ────────────────────────────────────────────────────────────────

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
    <div className="space-y-2 py-1">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder ?? "Type and press Enter"}
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 px-3 shrink-0">
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

/*
 * ══════════════════════════════════════════════════════════════════════════════
 * AUTO APPLY TAB — DISABLED (future feature)
 * TODO: Re-enable by moving this JSX back into the Tabs component
 * and uncommenting the TabsTrigger above.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * <TabsContent value="auto-apply" className="mt-5 space-y-5 focus-visible:outline-none">
 *   <SettingCard
 *     icon={<Zap className="h-4 w-4" />}
 *     title="Auto Apply Mode"
 *     description="AI finds matching jobs and applies on your behalf — fully automated."
 *     accent={values.autoApply}
 *   >
 *     <SettingRow
 *       label="Enable Auto Apply"
 *       description={values.autoApply
 *         ? "AI is submitting applications automatically."
 *         : "Manual mode — you review every application before it's sent."}
 *       tooltip="When enabled, AI submits applications that meet your match threshold without any action from you."
 *     >
 *       <Controller control={control} name="autoApply"
 *         render={({ field }) => (<Switch checked={field.value} onCheckedChange={field.onChange} />)} />
 *     </SettingRow>
 *   </SettingCard>
 *
 *   {!values.autoApply && (
 *     <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3.5">
 *       <Hand className="h-4 w-4 text-muted-foreground shrink-0" />
 *       <p className="text-sm text-muted-foreground">Manual mode is active — you control every application before it's submitted.</p>
 *     </div>
 *   )}
 *
 *   {values.autoApply && (
 *     <>
 *       <SettingCard icon={<Settings2 className="h-4 w-4" />} title="Auto Apply Filters"
 *         description="Narrow down which jobs the AI targets on your behalf." accent>
 *         <SettingRow label="Match Score Threshold"
 *           description={`AI only applies when match score ≥ ${values.autoApplyFilters.minScore}%`}
 *           tooltip="Higher threshold = fewer, more targeted applications.">
 *           ... Match Score slider, Apply Speed selector, Only Verified toggle ...
 *         </SettingRow>
 *       </SettingCard>
 *       <SettingCard icon={<FileText className="h-4 w-4" />} title="Job Type & Location Targets"
 *         description="Set which jobs you want the AI to pursue.">
 *         ... Preferred Job Types chips, Preferred Locations TagInput, Salary Range inputs ...
 *       </SettingCard>
 *     </>
 *   )}
 * </TabsContent>
 */

export default function JobSeekerSettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const searchParams = useSearchParams();
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, type: "success", message: "" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState("interviews"); // TODO: was "auto-apply" — re-enable when auto-apply feature is ready

  // ── Google Calendar state ────────────────────────────────────────────────
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

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

  // ── Google Calendar handlers ─────────────────────────────────────────────

  // Load calendar connection status on mount
  useEffect(() => {
    fetch("/api/integrations/google-calendar")
      .then((r) => r.json())
      .then((d) => {
        setCalendarConnected(d.connected ?? false);
        setCalendarEmail(d.email ?? null);
      })
      .catch(() => {/* silently ignore — not critical */});
  }, []);

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const status = searchParams.get("calendar");
    if (status === "connected") {
      setCalendarConnected(true);
      showToast("success", "Google Calendar connected successfully.");
      // Re-fetch to get the email
      fetch("/api/integrations/google-calendar")
        .then((r) => r.json())
        .then((d) => {
          setCalendarConnected(d.connected ?? false);
          setCalendarEmail(d.email ?? null);
        })
        .catch(() => {});
      // Clean up query param without navigation
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "error") {
      showToast("error", "Google Calendar connection failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "denied") {
      showToast("error", "Google Calendar access was denied.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleCalendarConnect = () => {
    window.location.href = "/api/integrations/google-calendar/connect";
  };

  const handleCalendarDisconnect = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar", {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (res.ok) {
        setCalendarConnected(false);
        setCalendarEmail(null);
        showToast("success", "Google Calendar disconnected.");
      } else {
        showToast("error", "Failed to disconnect. Please try again.");
      }
    } catch {
      showToast("error", "Network error. Please try again.");
    } finally {
      setCalendarLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
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
      <div className="w-full max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header skeleton */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-muted animate-pulse" />
              <div className="h-3 w-52 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-9 w-28 rounded-xl bg-muted animate-pulse" />
          </div>
        </div>
        {/* Tabs skeleton */}
        <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
        {/* Cards skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-5 flex gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                <div className="h-3 w-52 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="px-5 py-4 space-y-4">
              {[1, 2].map((j) => (
                <div key={j} className="flex justify-between items-center">
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-48 rounded bg-muted/60 animate-pulse" />
                  </div>
                  <div className="h-5 w-10 rounded-full bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const userName = session?.user?.name ?? "";
  const userInitials = userName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "JS";

  return (
    <TooltipProvider>
      <form
        id="settings-form"
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-4xl mx-auto px-6 py-8 space-y-6"
      >
        {/* ── Profile Header Card ────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {/* gradient stripe */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary/70 via-primary to-primary/50" />

          <div className="px-6 py-5 flex items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              <Avatar className="h-16 w-16 ring-2 ring-border ring-offset-2 ring-offset-card">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="text-base font-bold bg-primary/10 text-primary">
                  {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : userInitials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                aria-label="Change photo"
              >
                <Camera className="h-4 w-4 text-white" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            {/* Name + email */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base text-foreground truncate leading-tight">
                {userName || "Your Name"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {session?.user?.email ?? ""}
              </p>
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 rounded-lg"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</>
                  ) : (
                    <><Camera className="h-3.5 w-3.5" />{avatarUrl ? "Change Photo" : "Upload Photo"}</>
                  )}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1.5 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleAvatarRemove}
                    disabled={avatarUploading}
                  >
                    <Trash2 className="h-3 w-3" />Remove
                  </Button>
                )}
              </div>
              {avatarError && (
                <p className="mt-1 text-xs text-destructive">{avatarError}</p>
              )}
            </div>

            {/* Right: save area */}
            <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
              {isDirty ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => reset()}
                    disabled={saving}
                    className="h-9 rounded-xl"
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="h-9 min-w-[110px] rounded-xl gap-2"
                  >
                    {saving ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                    ) : (
                      <><Save className="h-3.5 w-3.5" />Save Settings</>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · max 2 MB</p>
              )}
            </div>
          </div>

          {/* TODO: Auto-apply banner — re-enable when auto-apply feature is ready */}
          {/* When ready, restore:
              - AI active banner showing applied count and interviews booked
              - Pulsing indicator dot
              - Conditional on values.autoApply
          */}
        </div>

        {/* ── Mobile save bar ─────────────────────────────────────────────── */}
        {isDirty && (
          <div className="sm:hidden rounded-2xl border bg-card px-5 py-4 shadow-sm flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground font-medium">Unsaved changes</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => reset()} disabled={saving} className="h-8 rounded-xl">
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="h-8 min-w-[100px] rounded-xl gap-1.5">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="h-3.5 w-3.5" />Save</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full h-auto p-1 rounded-2xl flex flex-wrap gap-1 bg-muted/40 border border-border/40">
            {/* TODO: Auto-apply tab — re-enable when auto-apply feature is ready
            <TabsTrigger value="auto-apply" className="flex-1 gap-2 rounded-xl text-xs sm:text-sm py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Auto Apply</span>
              <span className="sm:hidden">Apply</span>
            </TabsTrigger>
            */}
            <TabsTrigger value="interviews" className="flex-1 gap-2 rounded-xl text-xs sm:text-sm py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Interviews</span>
              <span className="sm:hidden">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex-1 gap-2 rounded-xl text-xs sm:text-sm py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Profile Visibility</span>
              <span className="sm:hidden">Visibility</span>
            </TabsTrigger>
            <TabsTrigger value="resume-ai" className="flex-1 gap-2 rounded-xl text-xs sm:text-sm py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Resume & AI</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1 gap-2 rounded-xl text-xs sm:text-sm py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Bell className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Notifications</span>
              <span className="sm:hidden">Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════ AUTO APPLY TAB (DISABLED — future feature) ════════════════════ */}
          {/* TODO: Re-enable when auto-apply feature is ready — uncomment the TabsContent block below */}

          {/* ════════════════════ INTERVIEWS TAB ════════════════════ */}
          <TabsContent value="interviews" className="mt-5 space-y-5 focus-visible:outline-none">
            <SettingCard
              icon={<CalendarDays className="h-4 w-4" />}
              title="Interview Scheduling"
              description="Control how and when employers can book interviews with you."
            >
              <SettingRow
                label="Instant Interview Booking"
                description="Allow employers to book directly into your available time slots."
              >
                <Controller
                  control={control}
                  name="instantBooking"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingRow>
            </SettingCard>

            {values.instantBooking && (
              <SettingCard
                icon={<Settings2 className="h-4 w-4" />}
                title="Availability Settings"
                description="Set your calendar availability and connection preferences."
              >
                {/* Calendar connect */}
                <SettingRow label="Google Calendar" description="Sync availability and receive calendar invites.">
                  {calendarConnected ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                        {calendarEmail ?? "Connected"}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={calendarLoading}
                        onClick={handleCalendarDisconnect}
                        className="h-8 text-xs rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {calendarLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={calendarLoading}
                      onClick={handleCalendarConnect}
                      className="h-8 text-xs rounded-lg gap-1.5"
                    >
                      {calendarLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                      )}
                      Connect Calendar
                    </Button>
                  )}
                </SettingRow>

                {/* Weekly Availability */}
                <div className="py-3 border-t border-border/50">
                  <p className="text-sm font-medium text-foreground mb-3">Available Days</p>
                  <Controller
                    control={control}
                    name="weeklyAvailability"
                    render={({ field }) => (
                      <div className="flex gap-2 flex-wrap">
                        {DAYS.map((day) => {
                          const active = field.value.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => field.onChange(
                                active ? field.value.filter((d) => d !== day) : [...field.value, day]
                              )}
                              className={`h-10 w-12 rounded-xl border text-xs font-semibold transition-colors ${
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
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
                  description="Minimum break time between consecutive interviews."
                  tooltip="Prevents employers from scheduling back-to-back interviews."
                >
                  <Controller
                    control={control}
                    name="timeBuffer"
                    render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                        <SelectTrigger className="h-8 w-32 text-sm rounded-lg">
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
              </SettingCard>
            )}
          </TabsContent>

          {/* ════════════════════ PROFILE VISIBILITY TAB ════════════════════ */}
          <TabsContent value="profile" className="mt-5 space-y-5 focus-visible:outline-none">
            <SettingCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Profile Visibility"
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
            </SettingCard>

            {(values.showSalary || values.openToRelocation) && (
              <SettingCard
                icon={<DollarSign className="h-4 w-4" />}
                title="Visibility Details"
                description="Fine-tune the information shown on your public profile."
              >
                {values.showSalary && (
                  <div className="py-3">
                    <p className="text-sm font-medium text-foreground mb-2.5">Displayed Salary Range</p>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="salaryMin"
                        render={({ field }) => (
                          <Input type="number" placeholder="Min salary" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} className="h-9 text-sm" />
                        )}
                      />
                      <Controller
                        control={control}
                        name="salaryMax"
                        render={({ field }) => (
                          <Input type="number" placeholder="Max salary" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} className="h-9 text-sm" />
                        )}
                      />
                      <Controller
                        control={control}
                        name="salaryCurrency"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="h-9 w-24 text-sm shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                )}

                {values.showSalary && values.openToRelocation && (
                  <div className="border-t border-border/50" />
                )}

                {values.openToRelocation && (
                  <div className="py-3">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">Preferred Relocation Cities</p>
                    </div>
                    <Controller
                      control={control}
                      name="preferredLocations"
                      render={({ field }) => (
                        <TagInput values={field.value} onChange={field.onChange} placeholder="e.g. Dubai, Riyadh, Doha…" />
                      )}
                    />
                  </div>
                )}
              </SettingCard>
            )}
          </TabsContent>

          {/* ════════════════════ RESUME & AI TAB ════════════════════ */}
          <TabsContent value="resume-ai" className="mt-5 space-y-5 focus-visible:outline-none">
            <SettingCard
              icon={<BrainCircuit className="h-4 w-4" />}
              title="Resume & AI Behavior"
              description="Configure how AI writes and applies on your behalf."
            >
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
                      <SelectTrigger className="h-8 w-48 text-sm rounded-lg">
                        <SelectValue placeholder="Select resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_RESUMES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </SettingRow>

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

              <SettingRow
                label="Auto-answer Screening Questions"
                description="AI fills in pre-screening questionnaires from your profile."
                tooltip="AI uses your profile and resume to answer common screening questions. Review answers before submitting in Manual mode."
              >
                <Controller
                  control={control}
                  name="autoAnswerScreening"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingRow>
            </SettingCard>

            {values.autoGenerateCoverLetter && (
              <SettingCard
                icon={<Sparkles className="h-4 w-4" />}
                title="Cover Letter Tone"
                description="Choose the writing style AI uses for your cover letters."
              >
                <div className="py-3">
                  <Controller
                    control={control}
                    name="coverLetterTone"
                    render={({ field }) => (
                      <div className="flex gap-3 flex-wrap">
                        {(["professional", "friendly", "bold"] as const).map((tone) => (
                          <button
                            key={tone}
                            type="button"
                            onClick={() => field.onChange(tone)}
                            className={`flex-1 min-w-[100px] rounded-xl border py-3 px-4 text-sm font-medium capitalize transition-colors ${
                              field.value === tone
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            {tone === "professional" && "Professional"}
                            {tone === "friendly" && "Friendly"}
                            {tone === "bold" && "Bold"}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                  <p className="mt-3 text-xs text-muted-foreground">
                    {values.coverLetterTone === "professional" && "Clear, structured, and business-appropriate."}
                    {values.coverLetterTone === "friendly" && "Warm, approachable, and conversational."}
                    {values.coverLetterTone === "bold" && "Confident, direct, and memorable."}
                  </p>
                </div>
              </SettingCard>
            )}
          </TabsContent>

          {/* ════════════════════ NOTIFICATIONS TAB ════════════════════ */}
          <TabsContent value="notifications" className="mt-5 space-y-5 focus-visible:outline-none">
            <SettingCard
              icon={<Bell className="h-4 w-4" />}
              title="Notification Preferences"
              description="Choose which activity triggers a notification."
            >
              <SettingRow
                label="Job Match Alerts"
                description="Get notified when new jobs match your profile."
              >
                <Controller
                  control={control}
                  name="notifications.jobMatchAlerts"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingRow>

              <SettingRow
                label="Application Submitted"
                description="Confirmation each time an application is sent."
              >
                <Controller
                  control={control}
                  name="notifications.applicationSubmitted"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingRow>

              <SettingRow
                label="Interview Notifications"
                description="Reminders and updates about scheduled interviews."
              >
                <Controller
                  control={control}
                  name="notifications.interviewNotifications"
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </SettingRow>
            </SettingCard>
          </TabsContent>
        </Tabs>
      </form>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-6 right-6 z-50 pointer-events-none transition-all duration-300 ${
          toast.show ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
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