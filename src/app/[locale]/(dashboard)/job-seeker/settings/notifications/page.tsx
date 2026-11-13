"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  Smartphone,
} from "lucide-react";
import { SettingsHubShell } from "@/components/features/job-seeker/SettingsHubShell";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WhatsAppVerificationPanel, hasWhatsAppOn, type WhatsAppVerification } from "@/components/features/settings/WhatsAppVerificationPanel";

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
    // No WhatsApp in any default: only the user turns it on (messages then start after their START), and the server defaults never include it.
    interviews: { enabled: true, channels: ["in_app", "email"] },
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

/** Category column, then On + one column per channel. */
const GRID = "grid grid-cols-[minmax(0,1fr)_3rem_repeat(3,3.25rem)] items-center gap-x-1 sm:grid-cols-[minmax(0,1fr)_4rem_repeat(3,5rem)]";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const { locale } = useParams<{ locale: string }>();
  const isAr = locale === "ar";
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [serverPrefs, setServerPrefs] = useState<string>("");
  // The `updatedAt` of the copy this page last loaded or saved. Sent back with
  // every save so the server can refuse to overwrite a newer one (a STOP reply
  // on WhatsApp, another tab) with this page's stale snapshot.
  const updatedAtRef = useRef<string | undefined>(undefined);
  // Whether a START from the profile phone has verified it (WhatsApp messages need it).
  const [waVerification, setWaVerification] = useState<WhatsAppVerification | null>(null);

  // Fetch current preferences
  const loadPrefs = useCallback(() => {
    return fetch("/api/user/notification-preferences")
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
          updatedAtRef.current = data.updatedAt;
          setWaVerification(res.whatsappVerification ?? null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPrefs().finally(() => setLoading(false));
  }, [loadPrefs]);

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
        body: JSON.stringify({ ...prefs, expectedUpdatedAt: updatedAtRef.current }),
      });
      if (res.ok) {
        // A missing stamp just means the next save is unconditional, as before.
        updatedAtRef.current = await res.json().then((j) => j?.data?.updatedAt, () => undefined);
        setServerPrefs(JSON.stringify(prefs));
        setHasChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else if (res.status === 409) {
        // Newer preferences exist (e.g. a STOP reply). Never overwrite them with
        // this snapshot: show the latest and let the user decide again.
        toast.error(t("changedElsewhere"));
        await loadPrefs();
      }
    } finally {
      setSaving(false);
    }
  }, [prefs, t, loadPrefs]);

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
      <SettingsHubShell locale={locale}>
        <div className="space-y-4" aria-busy="true">
          <div className="h-64 bg-card animate-pulse rounded-xl border" />
          <div className="h-96 bg-card animate-pulse rounded-xl border" />
        </div>
      </SettingsHubShell>
    );
  }

  return (
    <SettingsHubShell locale={locale} className="pb-32 lg:pb-24">
    <div dir={isAr ? "rtl" : "ltr"}>
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
                  ? "ستصلك رسائل كلمة المرور والأمان فقط. ستظل الإشعارات داخل التطبيق تعمل."
                  : "You'll only receive password and security emails. In-app notifications will still work."}
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
              aria-pressed={prefs.emailFrequency === opt.value}
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
        {/* Shown while a WhatsApp channel is on, saved or not; renders nothing otherwise. */}
        <div className="px-4 pt-4 empty:hidden">
          <WhatsAppVerificationPanel whatsAppOn={hasWhatsAppOn(prefs.categories)} verification={waVerification} />
        </div>
        {/* One header row of channels, then one row per category: a switch for
            the category and a checkbox per channel. Off greys the boxes out
            rather than hiding them, so rows keep their height. */}
        <div role="table" aria-label={t("categories")} className="text-sm">
          <div role="row" className={`${GRID} border-b border-border/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}>
            {/* The cell keeps its grid column; only its text is visually hidden
                (sr-only on the cell itself took it out of the grid). */}
            <span role="columnheader"><span className="sr-only">{t("categories")}</span></span>
            <span role="columnheader" className="text-center">{t("columnOn")}</span>
            {(Object.keys(CHANNEL_LABELS) as Channel[]).map((ch) => (
              <span key={ch} role="columnheader" className="text-center">{t(CHANNEL_LABELS[ch].labelKey)}</span>
            ))}
          </div>
          <div role="rowgroup" className="divide-y divide-border/30">
          {CATEGORIES.map((cat) => {
            const pref = prefs.categories[cat.key];
            return (
              <div key={cat.key} role="row" className={`${GRID} relative px-4 py-3`}>
                <div role="cell" className="min-w-0">
                  <p className="font-medium">{t(cat.labelKey)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(cat.descKey)}</p>
                  {/* Password emails never pass through these preferences. */}
                  {cat.key === "system" && (
                    <p className="mt-1 text-xs text-muted-foreground">{tCommon("passwordEmailsAlwaysArrive")}</p>
                  )}
                </div>
                <div role="cell" className="flex justify-center">
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={() => toggleCategory(cat.key)}
                    aria-label={t(cat.labelKey)}
                  />
                </div>
                {(Object.keys(CHANNEL_LABELS) as Channel[]).map((ch) => (
                  <div key={ch} role="cell" className="flex justify-center">
                    <Checkbox
                      checked={pref.enabled && pref.channels.includes(ch)}
                      disabled={!pref.enabled}
                      onCheckedChange={() => toggleChannel(cat.key, ch)}
                      aria-label={`${t(cat.labelKey)}: ${t(CHANNEL_LABELS[ch].labelKey)}`}
                      className="size-5"
                    />
                  </div>
                ))}
              </div>
            );
          })}
          </div>
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
                  ? "أوقف جميع رسائل البريد الإلكتروني ما عدا رسائل كلمة المرور والأمان. ستبقى الإشعارات داخل التطبيق تعمل."
                  : "Stop all emails except password and security emails. In-app notifications will still work."}
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.unsubscribedAll}
            onCheckedChange={toggleUnsubscribeAll}
            aria-label={isAr ? "إيقاف جميع رسائل البريد" : "Unsubscribe from all emails"}
          />
        </div>
      </div>

      {/* Save bar.
          Two things were wrong with the original `sticky bottom-4` on a bare
          flex row. It had no background, so the page showed straight through
          it and on a short window the button painted on top of the last
          category row. And `bottom-4` is 16px off the viewport, which on a
          phone is underneath `WorkspaceBottomNav` (`fixed bottom-0 z-40`) —
          the button would have been unreachable there.

          So: a real surface, and the same bottom offset the assistant FAB
          already uses to clear that nav. `z-10` stays below the nav's `z-40`
          on purpose, so the nav is never covered. `pb-32` on the container
          reserves the lane so the bar never has to overlap anything. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center gap-3 rounded-xl border border-border/70 bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:bottom-4">
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
    </SettingsHubShell>
  );
}
