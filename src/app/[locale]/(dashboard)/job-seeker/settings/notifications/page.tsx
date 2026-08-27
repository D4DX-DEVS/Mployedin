"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Mail,
  MessageSquare,
  Briefcase,
  Eye,
  Calendar,
  FileText,
  Megaphone,
  Shield,
  Clock,
  Save,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailFrequency = "instant" | "daily" | "weekly" | "none";
type Channel = "in_app" | "email" | "whatsapp";

interface CategoryPref {
  enabled: boolean;
  channels: Channel[];
}

interface Preferences {
  emailFrequency: EmailFrequency;
  categories: {
    jobs: CategoryPref;
    applications: CategoryPref;
    interviews: CategoryPref;
    offers: CategoryPref;
    profile_views: CategoryPref;
    marketing: CategoryPref;
    system: CategoryPref;
  };
  unsubscribedAll: boolean;
  dailyDigestTime: string;
  timezone: string;
}

const DEFAULT_PREFS: Preferences = {
  emailFrequency: "daily",
  categories: {
    jobs: { enabled: true, channels: ["in_app", "email"] },
    applications: { enabled: true, channels: ["in_app", "email"] },
    interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] },
    offers: { enabled: true, channels: ["in_app", "email"] },
    profile_views: { enabled: true, channels: ["in_app", "email"] },
    marketing: { enabled: false, channels: ["email"] },
    system: { enabled: true, channels: ["in_app", "email"] },
  },
  unsubscribedAll: false,
  dailyDigestTime: "09:00",
  timezone: "Asia/Dubai",
};

type CategoryKey = keyof Preferences["categories"];

const FREQUENCY_OPTIONS: { value: EmailFrequency; labelKey: string; descKey: string }[] = [
  { value: "instant", labelKey: "frequencyInstant", descKey: "frequencyInstantDesc" },
  { value: "daily", labelKey: "frequencyDaily", descKey: "frequencyDailyDesc" },
  { value: "weekly", labelKey: "frequencyWeekly", descKey: "frequencyWeeklyDesc" },
  { value: "none", labelKey: "frequencyOff", descKey: "frequencyOffDesc" },
];

interface CategoryConfig {
  key: CategoryKey;
  icon: typeof Bell;
  labelKey: string;
  descKey: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "jobs",
    icon: Briefcase,
    labelKey: "catJobs",
    descKey: "catJobsDesc",
  },
  {
    key: "applications",
    icon: FileText,
    labelKey: "catApplications",
    descKey: "catApplicationsDesc",
  },
  {
    key: "interviews",
    icon: Calendar,
    labelKey: "catInterviews",
    descKey: "catInterviewsDesc",
  },
  {
    key: "offers",
    icon: FileText,
    labelKey: "catOffers",
    descKey: "catOffersDesc",
  },
  {
    key: "profile_views",
    icon: Eye,
    labelKey: "catProfileViews",
    descKey: "catProfileViewsDesc",
  },
  {
    key: "marketing",
    icon: Megaphone,
    labelKey: "catMarketing",
    descKey: "catMarketingDesc",
  },
  {
    key: "system",
    icon: Shield,
    labelKey: "catSystem",
    descKey: "catSystemDesc",
  },
];

const CHANNEL_LABELS: Record<Channel, { labelKey: string; icon: typeof Mail }> = {
  in_app: { labelKey: "channelInApp", icon: Bell },
  email: { labelKey: "channelEmail", icon: Mail },
  whatsapp: { labelKey: "channelWhatsApp", icon: Smartphone },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const t = useTranslations("notifications");

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [serverPrefs, setServerPrefs] = useState<string>("");

  // Fetch current preferences
  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          const loaded: Preferences = {
            emailFrequency: data.emailFrequency ?? "daily",
            categories: {
              jobs: data.categories?.jobs ?? DEFAULT_PREFS.categories.jobs,
              applications: data.categories?.applications ?? DEFAULT_PREFS.categories.applications,
              interviews: data.categories?.interviews ?? DEFAULT_PREFS.categories.interviews,
              offers: data.categories?.offers ?? DEFAULT_PREFS.categories.offers,
              profile_views: data.categories?.profile_views ?? DEFAULT_PREFS.categories.profile_views,
              marketing: data.categories?.marketing ?? DEFAULT_PREFS.categories.marketing,
              system: data.categories?.system ?? DEFAULT_PREFS.categories.system,
            },
            unsubscribedAll: data.unsubscribedAll ?? false,
            dailyDigestTime: data.dailyDigestTime ?? "09:00",
            timezone: data.timezone ?? "Asia/Dubai",
          };
          setPrefs(loaded);
          setServerPrefs(JSON.stringify(loaded));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Track changes
  useEffect(() => {
    if (serverPrefs) {
      setHasChanges(JSON.stringify(prefs) !== serverPrefs);
    }
  }, [prefs, serverPrefs]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setServerPrefs(JSON.stringify(prefs));
        setHasChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  const toggleCategory = (key: CategoryKey) => {
    setPrefs((p) => ({
      ...p,
      categories: {
        ...p.categories,
        [key]: { ...p.categories[key], enabled: !p.categories[key].enabled },
      },
    }));
  };

  const toggleChannel = (key: CategoryKey, channel: Channel) => {
    setPrefs((p) => {
      const cat = p.categories[key];
      const channels = cat.channels.includes(channel)
        ? cat.channels.filter((c) => c !== channel)
        : [...cat.channels, channel];
      return {
        ...p,
        categories: {
          ...p.categories,
          [key]: { ...cat, channels },
        },
      };
    });
  };

  const toggleUnsubscribeAll = () => {
    setPrefs((p) => ({ ...p, unsubscribedAll: !p.unsubscribedAll }));
  };

  if (loading) {
    return (
      <div className="page-container max-w-3xl mx-auto">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-64 bg-card animate-pulse rounded-xl border" />
          <div className="h-96 bg-card animate-pulse rounded-xl border" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-3xl mx-auto" dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/${locale}/job-seeker/settings`}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Global Unsubscribe Banner */}
      {prefs.unsubscribedAll && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 card-pad">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {isAr ? "جميع الإشعارات عبر البريد الإلكتروني متوقفة" : "All email notifications are turned off"}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {isAr
                  ? "لن تتلقى أي رسائل بريد إلكتروني. ستظل الإشعارات داخل التطبيق تعمل."
                  : "You won't receive any emails. In-app notifications will still work."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Frequency */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm mb-4">
        <div className="px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="heading-label font-semibold tracking-tight">
                {t("globalFrequency")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "كم مرة تريد تلقي رسائل البريد الإلكتروني" : "How often you want to receive emails"}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPrefs((p) => ({ ...p, emailFrequency: opt.value }))}
              className={`rounded-lg border-2 text-left transition-all ${ prefs.emailFrequency === opt.value ? "border-primary bg-primary/5" : "border-border/50 hover:border-border" } chip-pad`}
            >
              <div className="text-sm font-medium">{t(opt.labelKey)}</div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-tight">
                {t(opt.descKey)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Category Controls */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm mb-4">
        <div className="px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="heading-label font-semibold tracking-tight">
                {t("categories")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "اختر ما تريد تلقيه ومن أين" : "Choose what to receive and through which channels"}
              </p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border/30">
          {CATEGORIES.map((cat) => {
            const pref = prefs.categories[cat.key];
            const Icon = cat.icon;
            return (
              <div key={cat.key} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 mt-0.5 shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t(cat.labelKey)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(cat.descKey)}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={() => toggleCategory(cat.key)}
                  />
                </div>

                {/* Channel toggles (shown when category is enabled) */}
                {pref.enabled && (
                  <div className={`flex items-center gap-2 mt-3 ${isAr ? "mr-11" : "ml-11"}`}>
                    {(Object.keys(CHANNEL_LABELS) as Channel[]).map((ch) => {
                      const chConf = CHANNEL_LABELS[ch];
                      const ChIcon = chConf.icon;
                      const active = pref.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          onClick={() => toggleChannel(cat.key, ch)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"
                          }`}
                        >
                          <ChIcon className="w-3 h-3" />
                          {t(chConf.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Unsubscribe */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm mb-6">
        <div className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive/10 mt-0.5 shrink-0">
              <Mail className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {isAr ? "إيقاف جميع رسائل البريد" : "Unsubscribe from all emails"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "أوقف جميع رسائل البريد الإلكتروني. ستبقى الإشعارات داخل التطبيق تعمل."
                  : "Stop all emails. In-app notifications will still work."}
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.unsubscribedAll}
            onCheckedChange={toggleUnsubscribeAll}
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 sticky bottom-4">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving
            ? t("saving")
            : t("saveChanges")}
        </Button>
        {saved && (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
            <CheckCircle2 className="w-3 h-3" />
            {t("saved")}
          </Badge>
        )}
        {hasChanges && !saved && (
          <span className="text-xs text-muted-foreground">
            {isAr ? "لديك تغييرات غير محفوظة" : "You have unsaved changes"}
          </span>
        )}
      </div>
    </div>
  );
}
