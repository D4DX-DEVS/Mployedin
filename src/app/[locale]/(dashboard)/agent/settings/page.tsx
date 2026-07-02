"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Globe, DollarSign, Save, CheckCircle2, Bell, Shield, Clock,
  Users, Calendar, FileText, Briefcase, Mail, ChevronRight, Percent,
  MapPin, AlertTriangle, Camera, Loader2, Trash2, UserCircle, Sparkles,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";
import { CalendarFeedCard } from "@/components/features/settings/CalendarFeedCard";
import {
  COUNTRY_CURRENCIES,
  SUPPORTED_CURRENCIES,
  currencyForCountry,
} from "@/lib/currency";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COUNTRIES = Object.entries(COUNTRY_CURRENCIES).map(([code, info]) => ({
  code,
  label: `${code} â€” ${info.label} (${info.code})`,
}));

type TabKey = "profile" | "region" | "commission" | "invoice" | "notifications" | "availability" | "security";

const NAV_ITEMS: { key: TabKey; icon: typeof Globe }[] = [
  { key: "profile", icon: UserCircle },
  { key: "region", icon: Globe },
  { key: "commission", icon: Percent },
  { key: "invoice", icon: Receipt },
  { key: "notifications", icon: Bell },
  { key: "availability", icon: Clock },
  { key: "security", icon: Shield },
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

const AGENT_CATEGORIES: { key: CategoryKey; icon: typeof Bell }[] = [
  { key: "placements", icon: Users },
  { key: "commissions", icon: DollarSign },
  { key: "team", icon: Briefcase },
  { key: "jobs", icon: FileText },
  { key: "system", icon: Shield },
];

const FREQ_OPTIONS: { value: EmailFrequency }[] = [
  { value: "instant" },
  { value: "daily" },
  { value: "weekly" },
  { value: "none" },
];

const CH_LABELS: Record<Channel, { Icon: typeof Bell }> = {
  in_app: { Icon: Bell },
  email: { Icon: Mail },
};

const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata", "Asia/Karachi", "Asia/Cairo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// â”€â”€â”€ Sub-Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: typeof Globe; title: string; description?: string }) {
  return (
    <div className="px-6 py-4 border-b border-border/40">
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

function SaveFeedback({ saving, saved, hasChanges, onSave, label }: {
  saving: boolean; saved: boolean; hasChanges: boolean; onSave: () => void; label?: string;
}) {
  const t = useTranslations("agentSettings");
  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={onSave} disabled={saving || !hasChanges} size="sm" className="gap-2">
        <Save className="w-4 h-4" />
        {saving ? t("save.saving") : label ?? t("save.default")}
      </Button>
      {saved && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t("save.saved")}
        </span>
      )}
    </div>
  );
}

// â”€â”€â”€ Helper: CSRF Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getCsrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf-token="));
  return match?.split("=")[1] ?? "";
}

// â”€â”€â”€ Tab: Profile & Avatar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function ProfileTab() {
  const { data: session, update: updateSession } = useSession();
  const t = useTranslations("agentSettings");
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

  const userName = session?.user?.name ?? t("profile.fallbackName");
  const userEmail = session?.user?.email ?? "";

  // Load avatar from session
  useEffect(() => {
    if (session?.user?.image) setAvatarUrl(session.user.image);
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.image, session?.user?.name]);

  // Load profile data
  useEffect(() => {
    fetch("/api/agent/profile")
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
      setError(t("profile.errors.fileType"));
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(t("profile.errors.fileSize"));
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
      const res = await fetch("/api/agent/avatar", {
        method: "POST",
        body: form,
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t("profile.errors.uploadFailed"));
        setPreview(null);
        return;
      }
      const data = await res.json();
      setAvatarUrl(data.url);
      setPreview(null);
      await updateSession({ image: data.url });
    } catch {
      setError(t("profile.errors.network"));
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [t, updateSession]);

  const handleRemove = useCallback(async () => {
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/agent/avatar", {
        method: "DELETE",
        headers: { "x-csrf-token": getCsrfToken() },
      });
      if (res.ok) {
        setAvatarUrl(null);
        setPreview(null);
        await updateSession({ image: null });
      }
    } catch {
      setError(t("profile.errors.removeFailed"));
    } finally {
      setUploading(false);
    }
  }, [t, updateSession]);

  const handleProfileSave = async () => {
    if (!name.trim()) return;
    setProfileSaving(true);
    try {
      const res = await fetch("/api/agent/profile", {
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
      {/* Role Badge Hero with Avatar */}
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-r from-primary/[0.06] via-primary/[0.03] to-transparent">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.04] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="p-6 flex items-center gap-4">
          {/* Avatar */}
          <div className="relative group shrink-0">
            <div className="w-20 h-20 rounded-2xl border-2 border-primary/20 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/40 shadow-sm">
              {displayUrl ? (
                <img src={displayUrl} alt={t("profile.photoAlt")} className="w-full h-full object-cover" />
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

          {/* Name + Agent badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-semibold tracking-tight truncate">{name || userName}</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Shield className="w-3 h-3" />
                {t("role.agent")}
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
                {displayUrl ? t("profile.changePhoto") : t("profile.uploadPhoto")}
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
                  {t("profile.removePhoto")}
                </Button>
              )}
            </div>
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">{t("profile.fileHint")}</p>
          </div>
        </div>
      </div>

      {/* Editable Profile Fields */}
      <SectionCard>
        <SectionHeader icon={UserCircle} title={t("profile.basicTitle")} description={t("profile.basicDescription")} />
        <div className="p-6 space-y-5">
          {profileLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="agent-name" className="text-sm font-medium text-foreground">
                    {t("profile.fullName")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="agent-name"
                    placeholder={t("profile.fullNamePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("profile.fullNameHelp")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-phone" className="text-sm font-medium text-foreground">
                    {t("profile.phone")}
                  </Label>
                  <Input
                    id="agent-phone"
                    type="tel"
                    placeholder={t("profile.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("profile.phoneHelp")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">{t("profile.email")}</Label>
                <div className="flex items-center gap-2 h-10 rounded-xl border border-border bg-muted/30 px-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{userEmail}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{t("profile.readOnly")}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("profile.emailHelp")}
                </p>
              </div>

              <SaveFeedback saving={profileSaving} saved={profileSaved} hasChanges={profileHasChanges} onSave={handleProfileSave} label={t("profile.save")} />
            </>
          )}
        </div>
      </SectionCard>
    </>
  );
}

// â”€â”€â”€ Tab: Region & Currency â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RegionTab() {
  const t = useTranslations("agentSettings");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [country, setCountry] = useState("");
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          setCountry(data.settings.country ?? "");
          setCurrencyCode(data.settings.currencyCode ?? "AED");
          setServerSnap(JSON.stringify({ country: data.settings.country ?? "", currencyCode: data.settings.currencyCode ?? "AED" }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = serverSnap ? JSON.stringify({ country, currencyCode }) !== serverSnap : false;

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setCountry(newCountry);
    if (newCountry) {
      const info = currencyForCountry(newCountry);
      setCurrencyCode(info.code);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, currencyCode }),
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
        <SectionHeader icon={Globe} title={t("region.title")} description={t("region.description")} />
        <div className="p-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t("region.country")}
              </Label>
              <select
                id="country"
                value={country}
                onChange={handleCountryChange}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                <option value="">{t("region.selectCountry")}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("region.countryHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                {t("region.displayCurrency")}
              </Label>
              <select
                id="currency"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} â€” {c.code} ({c.label})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("region.currencyHelp")}
              </p>
            </div>
          </div>

          <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("region.save")} />
        </div>
      </SectionCard>

      {/* Currency Preview */}
      <SectionCard>
        <SectionHeader icon={DollarSign} title={t("region.previewTitle")} description={t("region.previewDescription")} />
        <div className="p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[12500, 85000, 250000].map((amount) => {
              const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
              const symbol = info?.symbol ?? currencyCode;
              return (
                <div key={amount} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("region.sample")}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {symbol} {amount.toLocaleString(numberLocale)}
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

// â”€â”€â”€ Tab: Commission Rate (read-only for agents) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CommissionTab() {
  const t = useTranslations("agentSettings");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [commissionRate, setCommissionRate] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          setCommissionRate(data.settings.commissionRate ?? 0);
          setCurrencyCode(data.settings.currencyCode ?? "AED");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-muted/30" />;

  return (
    <>
      <SectionCard>
        <SectionHeader icon={Percent} title={t("commission.title")} description={t("commission.description")} />
        <div className="p-6 space-y-6">
          <div className="max-w-md space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Percent className="h-4 w-4 text-muted-foreground" />
              {t("commission.currentRate")}
            </Label>
            <div className="flex items-center gap-2 h-11 rounded-xl border border-border bg-muted/30 px-4">
              <span className="text-lg font-semibold text-foreground">{commissionRate}%</span>
              <Badge variant="outline" className="ml-auto text-[10px] shrink-0">{t("commission.setByAdmin")}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("commission.help")}
            </p>
          </div>

          {/* Commission Preview */}
          {commissionRate > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-3">{t("commission.projected")}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {[50000, 120000, 300000].map((salary) => {
                  const commission = salary * (commissionRate / 100);
                  const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
                  const symbol = info?.symbol ?? currencyCode;
                  return (
                    <div key={salary} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t("commission.onPlacement", { amount: `${symbol} ${salary.toLocaleString(numberLocale)}` })}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {symbol} {commission.toLocaleString(numberLocale, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("commission.rateLine", { rate: commissionRate })}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </>
  );
}

// â”€â”€â”€ Tab: Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NotificationsTab() {
  const t = useTranslations("agentSettings");
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
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("notifications.pausedTitle")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {t("notifications.pausedDescription")}
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
        <SectionHeader icon={Clock} title={t("notifications.frequencyTitle")} description={t("notifications.frequencyDescription")} />
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
              <div className="text-sm font-medium">{t(`notifications.frequency.${opt.value}.label`)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{t(`notifications.frequency.${opt.value}.description`)}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Digest time */}
      {(prefs.emailFrequency === "daily" || prefs.emailFrequency === "weekly") && (
        <SectionCard>
          <SectionHeader icon={Clock} title={t("notifications.digestTitle")} description={t("notifications.digestDescription")} />
          <div className="p-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("notifications.digestTime")}</Label>
              <Input
                type="time"
                value={prefs.dailyDigestTime}
                onChange={(e) => setPrefs((p) => ({ ...p, dailyDigestTime: e.target.value }))}
                className="max-w-[180px]"
              />
              <p className="text-xs text-muted-foreground">{t("notifications.digestTimeHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("notifications.timezone")}</Label>
              <select
                value={prefs.timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                className="h-10 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Categories */}
      <SectionCard>
        <SectionHeader icon={Bell} title={t("notifications.categoriesTitle")} description={t("notifications.categoriesDescription")} />
        <div className="divide-y divide-border/30">
          {AGENT_CATEGORIES.map((cat) => {
            const pref = prefs.categories[cat.key];
            return (
              <div key={cat.key} className="px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 mt-0.5 shrink-0">
                      <cat.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t(`notifications.categories.${cat.key}.label`)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(`notifications.categories.${cat.key}.description`)}</p>
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
                      const { Icon: ChIcon } = CH_LABELS[ch];
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
                          {t(`notifications.channels.${ch}`)}
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
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-sm font-medium">{t("notifications.pauseAll")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("notifications.pauseAllDescription")}</p>
          </div>
          <Switch
            checked={prefs.unsubscribedAll}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, unsubscribedAll: v }))}
          />
        </div>
      </SectionCard>

      <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("notifications.save")} />
    </>
  );
}

// â”€â”€â”€ Tab: Availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AvailabilityTab() {
  const t = useTranslations("agentSettings");
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("18:00");
  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverSnap, setServerSnap] = useState("");

  useEffect(() => {
    fetch("/api/agent/settings")
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
      const res = await fetch("/api/agent/settings", {
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
        <SectionHeader icon={MapPin} title={t("availability.timezoneTitle")} description={t("availability.timezoneDescription")} />
        <div className="p-6">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-11 w-full max-w-md rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={Clock} title={t("availability.hoursTitle")} description={t("availability.hoursDescription")} />
        <div className="p-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2 max-w-md">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("availability.startTime")}</Label>
              <Input
                type="time"
                value={workingHoursStart}
                onChange={(e) => setWorkingHoursStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">{t("availability.endTime")}</Label>
              <Input
                type="time"
                value={workingHoursEnd}
                onChange={(e) => setWorkingHoursEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-foreground">{t("availability.workingDays")}</Label>
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
                    {t(`availability.days.${day}`)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("availability.daysHelp")}
            </p>
          </div>
        </div>
      </SectionCard>

      <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("availability.save")} />
    </>
  );
}

// â”€â”€â”€ Tab: Invoice Defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const INVOICE_CATEGORIES = [
  "recruitment",
  "subscription",
  "premium_posting",
  "featured_promotion",
  "exhibition",
  "bulk_hiring",
  "consulting",
  "custom_enterprise",
];

const INVOICE_TAX_TYPES = [
  "none",
  "gst",
  "vat",
  "reverse_charge",
  "sales_tax",
  "service_tax",
  "withholding_tax",
  "tds",
  "pst",
  "hst",
];

const INVOICE_PAYMENT_TERMS = [
  "immediate",
  "net_7",
  "net_15",
  "net_30",
  "net_45",
  "net_60",
  "net_90",
  "custom",
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
  billingCountry: "",
  billingTaxId: "",
};

function InvoiceDefaultsTab({ apiBase = "/api/agent/settings/invoice-defaults" }: { apiBase?: string }) {
  const t = useTranslations("agentSettings");
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
            billingCountry: d.billingCountry ?? "",
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

  // Auto-detect tax when billing country changes
  const handleBillingCountryChange = (country: string) => {
    update("billingCountry", country);
    if (country) {
      const info = currencyForCountry(country);
      update("defaultCurrency", info.code);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
          billingCountry: d.billingCountry ?? "",
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
            <p className="text-sm font-medium text-foreground">{t("invoice.bannerTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("invoice.bannerDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* Billing Entity */}
      <SectionCard>
        <SectionHeader icon={FileText} title={t("invoice.billingTitle")} description={t("invoice.billingDescription")} />
        <div className="p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-company" className="text-sm font-medium">{t("invoice.companyName")}</Label>
              <Input id="inv-company" placeholder={t("invoice.companyNamePlaceholder")} value={form.billingCompanyName} onChange={(e) => update("billingCompanyName", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-contact" className="text-sm font-medium">{t("invoice.contactPerson")}</Label>
              <Input id="inv-contact" placeholder={t("invoice.contactPersonPlaceholder")} value={form.billingContactPerson} onChange={(e) => update("billingContactPerson", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email" className="text-sm font-medium">{t("invoice.billingEmail")}</Label>
              <Input id="inv-email" type="email" placeholder={t("invoice.billingEmailPlaceholder")} value={form.billingEmail} onChange={(e) => update("billingEmail", e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-phone" className="text-sm font-medium">{t("invoice.billingPhone")}</Label>
              <Input id="inv-phone" type="tel" placeholder={t("invoice.billingPhonePlaceholder")} value={form.billingPhone} onChange={(e) => update("billingPhone", e.target.value)} maxLength={50} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-address" className="text-sm font-medium">{t("invoice.billingAddress")}</Label>
            <Textarea id="inv-address" placeholder={t("invoice.billingAddressPlaceholder")} value={form.billingAddress} onChange={(e) => update("billingAddress", e.target.value)} maxLength={500} rows={2} className="resize-none" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-country" className="text-sm font-medium">{t("invoice.billingCountry")}</Label>
              <select
                id="inv-country"
                value={form.billingCountry}
                onChange={(e) => handleBillingCountryChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                <option value="">{t("invoice.selectCountry")}</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">{t("invoice.countryHelp")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-taxid" className="text-sm font-medium">{t("invoice.taxId")}</Label>
              <Input id="inv-taxid" placeholder={t("invoice.taxIdPlaceholder")} value={form.billingTaxId} onChange={(e) => update("billingTaxId", e.target.value)} maxLength={50} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Invoice Preferences */}
      <SectionCard>
        <SectionHeader icon={Receipt} title={t("invoice.preferencesTitle")} description={t("invoice.preferencesDescription")} />
        <div className="p-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-category" className="text-sm font-medium">{t("invoice.defaultType")}</Label>
              <select
                id="inv-category"
                value={form.defaultCategory}
                onChange={(e) => update("defaultCategory", e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {INVOICE_CATEGORIES.map((category) => <option key={category} value={category}>{t(`invoice.categories.${category}`)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-currency" className="text-sm font-medium">{t("invoice.defaultCurrency")}</Label>
              <select
                id="inv-currency"
                value={form.defaultCurrency}
                onChange={(e) => update("defaultCurrency", e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} â€” {c.code} ({c.label})</option>)}
              </select>
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("invoice.taxConfiguration")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-taxtype" className="text-sm font-medium">{t("invoice.taxType")}</Label>
                <select
                  id="inv-taxtype"
                  value={form.defaultTaxType}
                  onChange={(e) => update("defaultTaxType", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  {INVOICE_TAX_TYPES.map((taxType) => <option key={taxType} value={taxType}>{t(`invoice.taxTypes.${taxType}`)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-taxpct" className="text-sm font-medium">{t("invoice.taxRate")}</Label>
                <Input id="inv-taxpct" type="number" min={0} max={100} step={0.5} value={form.defaultTaxPercent} onChange={(e) => update("defaultTaxPercent", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* Payment Terms */}
          <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("invoice.paymentTerms")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-terms" className="text-sm font-medium">{t("invoice.defaultTerms")}</Label>
                <select
                  id="inv-terms"
                  value={form.defaultPaymentTerms}
                  onChange={(e) => update("defaultPaymentTerms", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
                >
                  {INVOICE_PAYMENT_TERMS.map((term) => <option key={term} value={term}>{t(`invoice.paymentTermOptions.${term}`)}</option>)}
                </select>
              </div>
              {form.defaultPaymentTerms === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="inv-custom-days" className="text-sm font-medium">{t("invoice.customDays")}</Label>
                  <Input id="inv-custom-days" type="number" min={1} max={365} value={form.customPaymentDays} onChange={(e) => update("customPaymentDays", parseInt(e.target.value) || 30)} />
                </div>
              )}
            </div>
          </div>

          {/* Default Notes */}
          <div className="space-y-2">
            <Label htmlFor="inv-notes" className="text-sm font-medium">{t("invoice.defaultNotes")}</Label>
            <Textarea
              id="inv-notes"
              placeholder={t("invoice.defaultNotesPlaceholder")}
              value={form.defaultNotes}
              onChange={(e) => update("defaultNotes", e.target.value)}
              maxLength={1000}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground">{t("invoice.characters", { count: form.defaultNotes.length })}</p>
          </div>

          <SaveFeedback saving={saving} saved={saved} hasChanges={hasChanges} onSave={handleSave} label={t("invoice.save")} />
        </div>
      </SectionCard>
    </>
  );
}

// â”€â”€â”€ Tab: Account & Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SecurityTab() {
  const t = useTranslations("agentSettings");
  return (
    <>
      <SectionCard>
        <SectionHeader icon={Shield} title={t("security.accountTitle")} description={t("security.accountDescription")} />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">{t("security.role")}</p>
                <p className="text-sm font-medium">{t("role.agent")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-[11px] text-muted-foreground">{t("security.accountStatus")}</p>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t("security.active")}</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader icon={Shield} title={t("security.title")} description={t("security.description")} />
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t("security.loginNotifications")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("security.loginNotificationsDescription")}</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">{t("security.twoFactor")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("security.twoFactorDescription")}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">{t("security.comingSoon")}</Badge>
          </div>
        </div>
      </SectionCard>

      <ChangeEmailCard />
            <CalendarFeedCard />

      <SectionCard>
        <SectionHeader icon={AlertTriangle} title={t("security.dangerTitle")} description={t("security.dangerDescription")} />
        <div className="p-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <div>
              <p className="text-sm font-medium text-destructive">{t("security.deactivateTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("security.deactivateDescription")}</p>
            </div>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
              {t("security.deactivate")}
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function AgentSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const t = useTranslations("agentSettings");
  const common = useTranslations("agentCommon");

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {common("workspace")}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {t("hero.title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("hero.description")}
          </p>
        </div>
      </section>

      {/* Sidebar + Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

        {/* Left Navigation */}
        <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1.5 lg:mx-0 lg:sticky lg:top-4 lg:self-start">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            const label = t(`nav.${item.key}.label`);
            const description = t(`nav.${item.key}.description`);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`
                  flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-150
                  whitespace-nowrap lg:whitespace-normal min-w-[140px] lg:min-w-0 group
                  ${isActive
                    ? "bg-primary/[0.08] text-primary shadow-sm border border-primary/15"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }
                `}
              >
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors
                  ${isActive ? "bg-primary/15" : "bg-muted/60 group-hover:bg-muted"}
                `}>
                  <Icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                </div>
                <div className="hidden lg:block flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{label}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{description}</p>
                </div>
                <span className="hidden lg:block text-xs text-muted-foreground ml-auto">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? "text-primary" : ""}`} />
                </span>
                <span className="lg:hidden text-xs font-medium">{label.split(" ")[0]}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Content */}
        <div className="space-y-5 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "region" && <RegionTab />}
          {activeTab === "commission" && <CommissionTab />}
          {activeTab === "invoice" && <InvoiceDefaultsTab apiBase="/api/agent/settings/invoice-defaults" />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "availability" && <AvailabilityTab />}
          {activeTab === "security" && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}
