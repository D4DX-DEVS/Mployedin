"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Globe, DollarSign, Save, CheckCircle2, Bell, Shield, Clock,
  Users, Calendar, FileText, Briefcase, Mail, ChevronRight, Percent,
  MapPin, AlertTriangle, Camera, Loader2, Trash2, UserCircle,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import { TwoFactorCard } from "@/components/features/settings/TwoFactorCard";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import {
  COUNTRY_CURRENCIES,
  SUPPORTED_CURRENCIES,
  currencyForCountry,
} from "@/lib/currency";

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRIES = Object.entries(COUNTRY_CURRENCIES).map(([code, info]) => ({
  code,
  label: `${code} — ${info.label} (${info.code})`,
}));

type TabKey = "profile" | "region" | "commission" | "invoice" | "notifications" | "availability" | "security";

const NAV_ITEMS: { key: TabKey; label: string; desc: string; icon: typeof Globe }[] = [
  { key: "profile", label: "Profile & Avatar", desc: "Photo, name & display info", icon: UserCircle },
  { key: "region", label: "Region & Currency", desc: "Country, currency, display", icon: Globe },
  { key: "commission", label: "Commission Rate", desc: "Override rate for placements", icon: Percent },
  { key: "invoice", label: "Invoice Defaults", desc: "Billing & invoice presets", icon: Receipt },
  { key: "notifications", label: "Notifications", desc: "Email & in-app alerts", icon: Bell },
  { key: "availability", label: "Availability", desc: "Timezone & working hours", icon: Clock },
  { key: "security", label: "Account & Security", desc: "Password & account actions", icon: Shield },
];

type Channel = "in_app" | "email";
type CategoryKey = "placements" | "commissions" | "team" | "jobs" | "system";
type EmailFrequency = "instant" | "daily" | "weekly" | "none";

interface CategoryPref { enabled: boolean; channels: Channel[] }

interface NotifPrefs {
  emailFrequency: EmailFrequency;
  categories: Record<CategoryKey, CategoryPref>;
  unsubscribedAll: boolean;
  dailyDigestTime: string;
  timezone: string;
}

const SA_CATEGORIES: { key: CategoryKey; icon: typeof Bell; label: string; desc: string }[] = [
  { key: "placements", icon: Users, label: "Placements & Agents", desc: "Agent placements, candidate progress, and team activity" },
  { key: "commissions", icon: DollarSign, label: "Commission Updates", desc: "New commissions earned, payouts, and rate changes" },
  { key: "team", icon: Briefcase, label: "Team Performance", desc: "Weekly agent performance summaries and milestones" },
  { key: "jobs", icon: FileText, label: "Job Updates", desc: "New job postings, expirations, and market changes" },
  { key: "system", icon: Shield, label: "System & Security", desc: "Login alerts, platform notices, and security events" },
];

const FREQ_OPTIONS: { value: EmailFrequency; label: string; desc: string }[] = [
  { value: "instant", label: "Instant", desc: "As events happen" },
  { value: "daily", label: "Daily", desc: "One email/day" },
  { value: "weekly", label: "Weekly", desc: "Sunday summary" },
  { value: "none", label: "Off", desc: "In-app only" },
];

const CH_LABELS: Record<Channel, { label: string; Icon: typeof Bell }> = {
  in_app: { label: "In-App", Icon: Bell },
  email: { label: "Email", Icon: Mail },
};

const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Karachi", "Asia/Cairo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Globe; title: string; description?: string }) {
  return (
    <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border/40">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
    </div>
  );
}

function SaveFeedback({ saving, saved, hasChanges, onSave, label = "Save Changes" }: {
  saving: boolean; saved: boolean; hasChanges: boolean; onSave: () => void; label?: string;
}) {
  const tc = useTranslations("common");
  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={onSave} disabled={saving || !hasChanges} size="sm" className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? tc("saving") : label}
      </Button>
      {saved && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {tc("saved")}
        </span>
      )}
    </div>
  );
}

// ─── Helper: CSRF Token ───────────────────────────────────────────────────────

function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf-token="));
  return match?.split("=")[1] ?? "";
}

// ─── Tab: Profile & Avatar ────────────────────────────────────────────────────

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function ProfileTab() {
  const t = useTranslations("superAgentSettings");
  const tc = useTranslations("common");
  const { data: session, update: updateSession } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSnap, setProfileSnap] = useState("");

  const userName = session?.user?.name ?? "Super Agent";
  const userEmail = session?.user?.email ?? "";

  // Load profile data
  useEffect(() => {
    if (session?.user?.image) setAvatarUrl(session.user.image);
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.image, session?.user?.name]);

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile) {
          if (data.profile.phone) setPhone(data.profile.phone);
          setProfileSnap(JSON.stringify({ name: session?.user?.name ?? "", phone: data.profile.phone ?? "" }));
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileHasChanges = profileSnap ? JSON.stringify({ name, phone }) !== profileSnap : false;

  const displayUrl = preview ?? avatarUrl;

  const initials = (name || userName)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t("avatarInvalidType"));
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(t("avatarTooLarge"));
      return;
    }

    // Instant preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch("/api/super-agent/avatar", {
        method: "POST",
        body: form,
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t("avatarUploadFailed"));
        setPreview(null);
        return;
      }
      const data = await res.json();
      setAvatarUrl(data.url);
      setPreview(null);
      await updateSession({ image: data.url });
    } catch {
      setError(t("networkError"));
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [updateSession]);

  const handleRemove = useCallback(async () => {
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/super-agent/avatar", {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (res.ok) {
        setAvatarUrl(null);
        setPreview(null);
        await updateSession({ image: null });
      }
    } catch {
      setError(t("avatarRemoveFailed"));
    } finally {
      setUploading(false);
    }
  }, [updateSession]);

  const handleProfileSave = async () => {
    if (!name.trim()) return;
    setProfileSaving(true);
    try {
      const res = await fetch("/api/super-agent/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (res.ok) {
        setProfileSnap(JSON.stringify({ name, phone }));
        setProfileSaved(true);
        await updateSession({ name: name.trim() });
        setTimeout(() => setProfileSaved(false), 2500);
      }
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <>
      {/* Role Badge Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.04] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="p-6 flex items-center gap-4">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <div className="w-20 h-20 rounded-2xl border-2 border-primary/20 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/40 shadow-sm">
              {displayUrl ? (
                <img src={displayUrl} alt={t("profilePhoto")} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-primary/60">{initials}</span>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-2xl">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              title={t("changePhoto")}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              className="hidden"
            />
          </div>

          {/* Name + badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-semibold tracking-tight truncate">{name || userName}</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Shield className="w-3 h-3" />
                {t("superAgentRole")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{userEmail}</p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="h-7 text-xs"
              >
                {displayUrl ? t("changePhoto") : t("uploadPhoto")}
              </Button>
              {displayUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleRemove}
                  disabled={uploading}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3 me-1" />
                  {tc("delete")}
                </Button>
              )}
            </div>
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">{t("avatarFormats")}</p>
          </div>
        </div>
      </div>

      {/* Editable Profile Fields */}
      <SectionCard>
        <SectionHeader icon={UserCircle} title={t("basicInformation")} description={t("basicInformationDesc")} />
        <div className="p-6 space-y-5">
          {profileLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sa-name" className="text-sm font-medium text-foreground">
                    {tc("name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sa-name"
                    placeholder={t("namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("nameDesc")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sa-phone" className="text-sm font-medium text-foreground">
                    {tc("phone")}
                  </Label>
                  <Input
                    id="sa-phone"
                    type="tel"
                    placeholder={t("phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("phoneDesc")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">{tc("email")}</Label>
                <div className="flex items-center gap-2 h-10 rounded-xl border border-border bg-muted/30 px-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{userEmail}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{t("emailReadOnly")}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("emailDesc")}
                </p>
              </div>

              <SaveFeedback saving={profileSaving} saved={profileSaved} hasChanges={profileHasChanges} onSave={handleProfileSave} label={t("saveProfile")} />
            </>
          )}
        </div>
      </SectionCard>
    </>
  );
}

// ─── Tab: Region & Currency ───────────────────────────────────────────────────

function RegionTab() {
  const t = useTranslations("superAgentSettings");
  const tc = useTranslations("common");
  const [country, setCountry] = useState("none");
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          setCountry(data.settings.country ?? "none");
          setCurrencyCode(data.settings.currencyCode ?? "AED");
          setServerSnap(JSON.stringify({ country: data.settings.country ?? "none", currencyCode: data.settings.currencyCode ?? "AED" }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = serverSnap ? JSON.stringify({ country, currencyCode }) !== serverSnap : false;

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    if (newCountry && newCountry !== "none") {
      const info = currencyForCountry(newCountry);
      setCurrencyCode(info.code);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/super-agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: country === "none" ? "" : country, currencyCode }),
      });
      if (res.ok) {
        setServerSnap(JSON.stringify({ country, currencyCode }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      <SectionCard>
        <SectionHeader icon={Globe} title={t("countryAndCurrency")} description={t("countryAndCurrencyDesc")} />
        <div className="p-6 space-y-3 sm:space-y-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {tc("country")}
              </Label>
              <Select value={country} onValueChange={handleCountryChange}>
                <SelectTrigger id="country" className="h-11 text-sm">
                  <SelectValue placeholder={t("selectCountry")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("selectCountry")}</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("countryAutoFill")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                {t("displayCurrency")}
              </Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger id="currency" className="h-11 text-sm">
                  <SelectValue placeholder={tc("currency")} />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} — {c.code} ({c.label})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("currencyDesc")}
              </p>
            </div>
          </div>

          <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("saveRegionSettings")} />
        </div>
      </SectionCard>

      {/* Currency Preview */}
      <SectionCard>
        <SectionHeader icon={DollarSign} title={t("currencyPreview")} description={t("currencyPreviewDesc")} />
        <div className="p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[12500, 85000, 250000].map((amount) => {
              const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
              const symbol = info?.symbol ?? currencyCode;
              return (
                <div key={amount} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("sample")}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {symbol} {amount.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ─── Tab: Commission Rate Override ────────────────────────────────────────────

function CommissionTab() {
  const t = useTranslations("superAgentSettings");
  const [overrideRate, setOverrideRate] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-agent/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile) {
          setOverrideRate(data.profile.overrideRate ?? 0);
          setCurrencyCode(data.profile.currencyCode ?? "AED");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      <SectionCard>
        <SectionHeader icon={Percent} title={t("commissionOverride")} description={t("commissionOverrideDesc")} />
        <div className="p-6 space-y-3 sm:space-y-4">
          <div className="max-w-md space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Percent className="h-4 w-4 text-muted-foreground" />
              {t("currentOverrideRate")}
            </Label>
            <div className="flex items-center gap-2 h-11 rounded-xl border border-border bg-muted/30 px-4">
              <span className="text-lg font-semibold text-foreground">{overrideRate}%</span>
              <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{t("setByAdmin")}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("commissionAdminManaged")}
            </p>
          </div>

          <div className="rounded-xl border border-blue-200/60 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t("howItWorks")}</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  {t("commissionRateExplain")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Commission Preview */}
      {overrideRate > 0 && (
        <SectionCard>
          <SectionHeader icon={DollarSign} title={t("ratePreview")} description={t("ratePreviewDesc")} />
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {[50000, 120000, 300000].map((salary) => {
                const commission = salary * (overrideRate / 100);
                return (
                  <div key={salary} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("onPlacement", { amount: salary.toLocaleString() })}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {commission.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("percentCommission", { rate: overrideRate })}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab() {
  const t = useTranslations("superAgentSettings");
  const tc = useTranslations("common");
  const defaultPrefs: NotifPrefs = {
    emailFrequency: "daily",
    categories: {
      placements: { enabled: true, channels: ["in_app", "email"] },
      commissions: { enabled: true, channels: ["in_app", "email"] },
      team: { enabled: true, channels: ["in_app", "email"] },
      jobs: { enabled: true, channels: ["in_app"] },
      system: { enabled: true, channels: ["in_app", "email"] },
    },
    unsubscribedAll: false,
    dailyDigestTime: "09:00",
    timezone: "Asia/Dubai",
  };

  const [prefs, setPrefs] = useState<NotifPrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");
  const hasChanges = serverSnap ? JSON.stringify(prefs) !== serverSnap : false;

  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const d = res.data;
          const loaded: NotifPrefs = {
            emailFrequency: d.emailFrequency ?? "daily",
            categories: {
              placements: d.categories?.placements ?? defaultPrefs.categories.placements,
              commissions: d.categories?.commissions ?? defaultPrefs.categories.commissions,
              team: d.categories?.team ?? defaultPrefs.categories.team,
              jobs: d.categories?.jobs ?? defaultPrefs.categories.jobs,
              system: d.categories?.system ?? defaultPrefs.categories.system,
            },
            unsubscribedAll: d.unsubscribedAll ?? false,
            dailyDigestTime: d.dailyDigestTime ?? "09:00",
            timezone: d.timezone ?? "Asia/Dubai",
          };
          setPrefs(loaded);
          setServerSnap(JSON.stringify(loaded));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setServerSnap(JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      {/* Global kill switch */}
      {prefs.unsubscribedAll && (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("notificationsPaused")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {t("notificationsPausedDesc")}
                </p>
              </div>
            </div>
            <Switch
              checked={prefs.unsubscribedAll}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, unsubscribedAll: v }))}
            />
          </div>
        </div>
      )}

      {/* Email frequency */}
      <SectionCard>
        <SectionHeader icon={Clock} title={t("emailFrequency")} description={t("emailFrequencyDesc")} />
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FREQ_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, emailFrequency: opt.value }))}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                prefs.emailFrequency === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border"
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Digest time */}
      {(prefs.emailFrequency === "daily" || prefs.emailFrequency === "weekly") && (
        <SectionCard>
          <SectionHeader icon={Clock} title={t("digestSchedule")} description={t("digestScheduleDesc")} />
          <div className="p-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("digestTime")}</Label>
              <DateTimePicker
                mode="time"
                value={prefs.dailyDigestTime}
                onChange={(v) => setPrefs((p) => ({ ...p, dailyDigestTime: v }))}
              />
              <p className="text-xs text-muted-foreground">{t("digestTimeDesc")}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("timezone")}</Label>
              <Select value={prefs.timezone} onValueChange={(v) => setPrefs((p) => ({ ...p, timezone: v }))}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder={t("selectTimezone")} />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Categories */}
      <SectionCard>
        <SectionHeader icon={Bell} title={t("notificationCategories")} description={t("notificationCategoriesDesc")} />
        <div className="divide-y divide-border/30">
          {SA_CATEGORIES.map((cat) => {
            const pref = prefs.categories[cat.key];
            return (
              <div key={cat.key} className="px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 mt-0.5 shrink-0">
                      <cat.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={() =>
                      setPrefs((p) => ({
                        ...p,
                        categories: {
                          ...p.categories,
                          [cat.key]: { ...pref, enabled: !pref.enabled },
                        },
                      }))
                    }
                  />
                </div>
                {pref.enabled && (
                  <div className="flex items-center gap-2 mt-3 ml-11">
                    {(Object.keys(CH_LABELS) as Channel[]).map((ch) => {
                      const { label, Icon: ChIcon } = CH_LABELS[ch];
                      const active = pref.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => {
                            const channels = active
                              ? pref.channels.filter((c) => c !== ch)
                              : [...pref.channels, ch];
                            setPrefs((p) => ({
                              ...p,
                              categories: { ...p.categories, [cat.key]: { ...pref, channels } },
                            }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"
                          }`}
                        >
                          <ChIcon className="w-3 h-3" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Pause all */}
      <SectionCard>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="text-sm font-medium">{t("pauseAllNotifications")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("pauseAllNotificationsDesc")}</p>
          </div>
          <Switch
            checked={prefs.unsubscribedAll}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, unsubscribedAll: v }))}
          />
        </div>
      </SectionCard>

      <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("saveNotificationSettings")} />
    </>
  );
}

// ─── Tab: Availability ────────────────────────────────────────────────────────

function AvailabilityTab() {
  const t = useTranslations("superAgentSettings");
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");

  useEffect(() => {
    fetch("/api/super-agent/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          const s = data.settings;
          if (s.timezone) setTimezone(s.timezone);
          if (s.workingHoursStart) setWorkingHoursStart(s.workingHoursStart);
          if (s.workingHoursEnd) setWorkingHoursEnd(s.workingHoursEnd);
          if (s.workingDays) setWorkingDays(s.workingDays);
          setServerSnap(JSON.stringify({
            timezone: s.timezone ?? "Asia/Dubai",
            workingHoursStart: s.workingHoursStart ?? "09:00",
            workingHoursEnd: s.workingHoursEnd ?? "18:00",
            workingDays: s.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const current = JSON.stringify({ timezone, workingHoursStart, workingHoursEnd, workingDays });
  const hasChanges = serverSnap ? current !== serverSnap : false;

  const toggleDay = (day: string) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/super-agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, workingHoursStart, workingHoursEnd, workingDays }),
      });
      if (res.ok) {
        setServerSnap(current);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      <SectionCard>
        <SectionHeader icon={MapPin} title={t("timezone")} description={t("timezoneDesc")} />
        <div className="p-6">
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="h-11 w-full max-w-md text-sm">
              <SelectValue placeholder={t("selectTimezone")} />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={Clock} title={t("workingHours")} description={t("workingHoursDesc")} />
        <div className="p-6 space-y-3 sm:space-y-4">
          <div className="grid gap-6 sm:grid-cols-2 max-w-md">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("startTime")}</Label>
              <DateTimePicker
                mode="time"
                value={workingHoursStart}
                onChange={setWorkingHoursStart}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("endTime")}</Label>
              <DateTimePicker
                mode="time"
                value={workingHoursEnd}
                onChange={setWorkingHoursEnd}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">{t("workingDays")}</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const active = workingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("workingDaysDesc")}
            </p>
          </div>
        </div>
      </SectionCard>

      <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("saveAvailability")} />
    </>
  );
}

// ─── Tab: Invoice Defaults ────────────────────────────────────────────────────

const INVOICE_CATEGORIES = [
  { value: "recruitment", label: "Recruitment Placement" },
  { value: "subscription", label: "Employer Subscription" },
  { value: "premium_posting", label: "Premium Job Posting" },
  { value: "featured_promotion", label: "Featured Employer Promotion" },
  { value: "exhibition", label: "Exhibition Billing" },
  { value: "bulk_hiring", label: "Bulk Hiring Package" },
  { value: "consulting", label: "Consulting Fee" },
  { value: "custom_enterprise", label: "Custom Enterprise Billing" },
];

const INVOICE_TAX_TYPES = [
  { value: "none", label: "No Tax" },
  { value: "gst", label: "GST" },
  { value: "vat", label: "VAT" },
  { value: "reverse_charge", label: "Reverse Charge" },
  { value: "sales_tax", label: "Sales Tax" },
  { value: "service_tax", label: "Service Tax" },
  { value: "withholding_tax", label: "Withholding Tax" },
  { value: "tds", label: "TDS" },
  { value: "pst", label: "PST" },
  { value: "hst", label: "HST" },
];

const INVOICE_PAYMENT_TERMS = [
  { value: "immediate", label: "Immediate" },
  { value: "net_7", label: "Net 7 days" },
  { value: "net_15", label: "Net 15 days" },
  { value: "net_30", label: "Net 30 days" },
  { value: "net_45", label: "Net 45 days" },
  { value: "net_60", label: "Net 60 days" },
  { value: "net_90", label: "Net 90 days" },
  { value: "custom", label: "Custom" },
];

interface InvoiceDefaultsState {
  defaultCurrency: string;
  defaultPaymentTerms: string;
  customPaymentDays: number;
  defaultTaxType: string;
  defaultTaxPercent: number;
  defaultCategory: string;
  defaultNotes: string;
  billingCompanyName: string;
  billingContactPerson: string;
  billingEmail: string;
  billingPhone: string;
  billingAddress: string;
  billingCountry: string;
  billingTaxId: string;
}

const EMPTY_DEFAULTS: InvoiceDefaultsState = {
  defaultCurrency: "AED",
  defaultPaymentTerms: "net_30",
  customPaymentDays: 30,
  defaultTaxType: "none",
  defaultTaxPercent: 0,
  defaultCategory: "recruitment",
  defaultNotes: "",
  billingCompanyName: "",
  billingContactPerson: "",
  billingEmail: "",
  billingPhone: "",
  billingAddress: "",
  billingCountry: "none",
  billingTaxId: "",
};

function InvoiceDefaultsTab({ apiBase = "/api/super-agent/settings/invoice-defaults" }: { apiBase?: string }) {
  const t = useTranslations("superAgentSettings");
  const tc = useTranslations("common");
  const [form, setForm] = useState<InvoiceDefaultsState>(EMPTY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");

  useEffect(() => {
    fetch(apiBase)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.invoiceDefaults) {
          const d = data.invoiceDefaults;
          const state: InvoiceDefaultsState = {
            defaultCurrency: d.defaultCurrency ?? "AED",
            defaultPaymentTerms: d.defaultPaymentTerms ?? "net_30",
            customPaymentDays: d.customPaymentDays ?? 30,
            defaultTaxType: d.defaultTaxType ?? "none",
            defaultTaxPercent: d.defaultTaxPercent ?? 0,
            defaultCategory: d.defaultCategory ?? "recruitment",
            defaultNotes: d.defaultNotes ?? "",
            billingCompanyName: d.billingCompanyName ?? "",
            billingContactPerson: d.billingContactPerson ?? "",
            billingEmail: d.billingEmail ?? "",
            billingPhone: d.billingPhone ?? "",
            billingAddress: d.billingAddress ?? "",
            billingCountry: d.billingCountry ?? "none",
            billingTaxId: d.billingTaxId ?? "",
          };
          setForm(state);
          setServerSnap(JSON.stringify(state));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  const hasChanges = serverSnap ? JSON.stringify(form) !== serverSnap : false;

  const update = (key: keyof InvoiceDefaultsState, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBillingCountryChange = (country: string) => {
    update("billingCountry", country);
    if (country && country !== "none") {
      const info = currencyForCountry(country);
      update("defaultCurrency", info.code);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, billingCountry: form.billingCountry === "none" ? "" : form.billingCountry };
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        const d = data.invoiceDefaults;
        const state: InvoiceDefaultsState = {
          defaultCurrency: d.defaultCurrency ?? "AED",
          defaultPaymentTerms: d.defaultPaymentTerms ?? "net_30",
          customPaymentDays: d.customPaymentDays ?? 30,
          defaultTaxType: d.defaultTaxType ?? "none",
          defaultTaxPercent: d.defaultTaxPercent ?? 0,
          defaultCategory: d.defaultCategory ?? "recruitment",
          defaultNotes: d.defaultNotes ?? "",
          billingCompanyName: d.billingCompanyName ?? "",
          billingContactPerson: d.billingContactPerson ?? "",
          billingEmail: d.billingEmail ?? "",
          billingPhone: d.billingPhone ?? "",
          billingAddress: d.billingAddress ?? "",
          billingCountry: d.billingCountry ?? "none",
          billingTaxId: d.billingTaxId ?? "",
        };
        setForm(state);
        setServerSnap(JSON.stringify(state));
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      {/* Info Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-start gap-3">
          <Receipt className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">{t("speedUpInvoice")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("speedUpInvoiceDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* Billing Entity */}
      <SectionCard>
        <SectionHeader icon={FileText} title={t("billingEntity")} description={t("billingEntityDesc")} />
        <div className="p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-company" className="text-sm font-medium">{t("companyName")}</Label>
              <Input id="inv-company" placeholder={t("companyNamePlaceholder")} value={form.billingCompanyName} onChange={(e) => update("billingCompanyName", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-contact" className="text-sm font-medium">{t("contactPerson")}</Label>
              <Input id="inv-contact" placeholder={t("contactPersonPlaceholder")} value={form.billingContactPerson} onChange={(e) => update("billingContactPerson", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email" className="text-sm font-medium">{t("billingEmail")}</Label>
              <Input id="inv-email" type="email" placeholder={t("billingEmailPlaceholder")} value={form.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-phone" className="text-sm font-medium">{t("billingPhone")}</Label>
              <Input id="inv-phone" type="tel" placeholder={t("billingPhonePlaceholder")} value={form.billingPhone} onChange={(e) => update("billingPhone", e.target.value)} maxLength={50} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-address" className="text-sm font-medium">{t("billingAddress")}</Label>
            <Textarea id="inv-address" placeholder={t("billingAddressPlaceholder")} value={form.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} maxLength={500} rows={2} className="resize-none" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-country" className="text-sm font-medium">{t("billingCountry")}</Label>
              <Select value={form.billingCountry} onValueChange={handleBillingCountryChange}>
                <SelectTrigger id="inv-country" className="h-11 text-sm">
                  <SelectValue placeholder={t("selectCountry")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("selectCountry")}</SelectItem>
                  {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{t("billingCountryAutoUpdate")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-taxid" className="text-sm font-medium">{t("taxId")}</Label>
              <Input id="inv-taxid" placeholder={t("taxIdPlaceholder")} value={form.billingTaxId} onChange={(e) => update("billingTaxId", e.target.value)} maxLength={50} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Invoice Preferences */}
      <SectionCard>
        <SectionHeader icon={Receipt} title={t("invoicePreferences")} description={t("invoicePreferencesDesc")} />
        <div className="p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-category" className="text-sm font-medium">{t("defaultInvoiceType")}</Label>
              <Select value={form.defaultCategory} onValueChange={(val) => update("defaultCategory", val)}>
                <SelectTrigger id="inv-category" className="h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-currency" className="text-sm font-medium">{t("defaultCurrency")}</Label>
              <Select value={form.defaultCurrency} onValueChange={(val) => update("defaultCurrency", val)}>
                <SelectTrigger id="inv-currency" className="h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.symbol} — {c.code} ({c.label})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("taxConfiguration")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-taxtype" className="text-sm font-medium">{t("taxType")}</Label>
                <Select value={form.defaultTaxType} onValueChange={(val) => update("defaultTaxType", val)}>
                  <SelectTrigger id="inv-taxtype" className="h-11 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_TAX_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-taxpct" className="text-sm font-medium">{t("taxRate")}</Label>
                <Input id="inv-taxpct" type="number" min={0} max={100} step={0.5} value={form.defaultTaxPercent} onChange={(e) => update("defaultTaxPercent", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Payment Terms */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("paymentTerms")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-terms" className="text-sm font-medium">{t("defaultTerms")}</Label>
                <Select value={form.defaultPaymentTerms} onValueChange={(val) => update("defaultPaymentTerms", val)}>
                  <SelectTrigger id="inv-terms" className="h-11 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_PAYMENT_TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.defaultPaymentTerms === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="inv-custom-days" className="text-sm font-medium">{t("customDays")}</Label>
                  <Input id="inv-custom-days" type="number" min={1} max={365} value={form.customPaymentDays} onChange={(e) => update("customPaymentDays", parseInt(e.target.value) || 30)} />
                </div>
              )}
            </div>
          </div>

          {/* Default Notes */}
          <div className="space-y-2">
            <Label htmlFor="inv-notes" className="text-sm font-medium">{t("defaultInvoiceNotes")}</Label>
            <Textarea
              id="inv-notes"
              placeholder={t("defaultInvoiceNotesPlaceholder")}
              value={form.defaultNotes}
              onChange={(e) => update("defaultNotes", e.target.value)}
              maxLength={1000}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">{t("charCount", { current: form.defaultNotes.length, max: 1000 })}</p>
          </div>

          <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("saveInvoiceDefaults")} />
        </div>
      </SectionCard>
    </>
  );
}

// ─── Tab: Account & Security ──────────────────────────────────────────────────

function SecurityTab() {
  const t = useTranslations("superAgentSettings");
  const tc = useTranslations("common");
  return (
    <>
      <SectionCard>
        <SectionHeader icon={Shield} title={t("accountInformation")} description={t("accountInformationDesc")} />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">{t("role")}</p>
                <p className="text-sm font-medium">{t("superAgentRole")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">{t("accountStatus")}</p>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{tc("active")}</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={Shield} title={t("security")} description={t("securityDesc")} />
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t("loginNotifications")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("loginNotificationsDesc")}</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </SectionCard>

      <TwoFactorCard />

      <ChangeEmailCard />

      <SectionCard>
        <SectionHeader icon={AlertTriangle} title={t("dangerZone")} description={t("dangerZoneDesc")} />
        <div className="p-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <div>
              <p className="text-sm font-medium text-destructive">{t("deactivateAccount")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("deactivateAccountDesc")}</p>
            </div>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
              {t("deactivateButton")}
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAgentSettingsPage() {
  const t = useTranslations("superAgentSettings");
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  return (
    <div className="page-container space-y-3 sm:space-y-4">
      <SuperAgentPageIntro
        title={t("settingsTitle")}
        description={t("settingsDescription")}
        summaryTitle={t("workspaceSettings")}
        summaryDescription={t("workspaceSettingsDesc")}
      />

      {/* Sidebar + Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

        {/* Left Navigation */}
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1.5 lg:mx-0 lg:sticky lg:top-4 lg:self-start">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`
                  flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all duration-150
                  whitespace-nowrap lg:whitespace-normal min-w-0 group
                  lg:gap-3 lg:px-3.5 lg:py-3 lg:rounded-xl
                  ${isActive
                    ? "bg-primary/[0.08] text-primary shadow-sm border border-primary/15"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }
                `}
              >
                <div className={`
                  flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-colors
                  lg:w-8 lg:h-8 lg:rounded-lg
                  ${isActive ? "bg-primary/15" : "bg-muted/60 group-hover:bg-muted"}
                `}>
                  <Icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 ${isActive ? "text-primary" : ""}`} />
                </div>
                <div className="hidden lg:block flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{item.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.desc}</p>
                </div>
                <span className="hidden lg:block text-xs text-muted-foreground ml-auto">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-primary" : ""}`} />
                </span>
                <span className="lg:hidden text-[11px] font-medium">{item.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Content */}
        <div className="space-y-5 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "region" && <RegionTab />}
          {activeTab === "commission" && <CommissionTab />}
          {activeTab === "invoice" && <InvoiceDefaultsTab apiBase="/api/super-agent/settings/invoice-defaults" />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "availability" && <AvailabilityTab />}
          {activeTab === "security" && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}
