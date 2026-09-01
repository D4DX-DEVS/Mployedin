"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Send, Globe, Plus, Trash2, Percent } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencySelect } from "@/components/ui/currency-select";
import { Switch } from "@/components/ui/switch";
import { TwoFactorCard } from "@/components/features/settings/TwoFactorCard";
import { ChangeEmailCard } from "@/components/features/settings/ChangeEmailCard";

interface SmtpConfig {
  smtpEmail: string;
  smtpAppPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

interface CommissionOverride {
  countryCode: string;
  rate: number;
  label: string;
}

interface SystemSettings {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
  smtp: SmtpConfig;
  commissionOverrides: CommissionOverride[];
}

export default function AdminSettingsPage() {
  const t = useTranslations("adminSettings");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({
    platformName: "MPLOYEDIN",
    supportEmail: "support@mployedin.com",
    maintenanceMode: false,
    defaultCurrency: "AED",
    smtp: {
      smtpEmail: "",
      smtpAppPassword: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
    },
    commissionOverrides: [],
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (!r.ok) {
          toast.error(t("failedToLoadSettings"));
          throw new Error("Failed to load settings");
        }
        return r.json();
      })
      .then((data) => {
        if (data.settings) {
          setSettings({
            platformName: data.settings.platformName ?? "MPLOYEDIN",
            supportEmail: data.settings.supportEmail ?? "support@mployedin.com",
            maintenanceMode: data.settings.maintenanceMode ?? false,
            defaultCurrency: data.settings.defaultCurrency ?? "AED",
            smtp: {
              smtpEmail: data.settings.smtp?.smtpEmail ?? "",
              smtpAppPassword: data.settings.smtp?.smtpAppPassword ?? "",
              smtpHost: data.settings.smtp?.smtpHost ?? "smtp.gmail.com",
              smtpPort: data.settings.smtp?.smtpPort ?? 587,
              smtpSecure: data.settings.smtp?.smtpSecure ?? false,
            },
            commissionOverrides: data.settings.commissionOverrides ?? [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        toast.success(t("settingsSavedSuccessfully"));
        setTimeout(() => setSaved(false), 2500);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("failedToSaveSettings"));
      }
    } catch (error) {
      toast.error(t("failedToSaveSettings"));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!settings.smtp.smtpEmail) return;
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp: settings.smtp }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok, message: data.message ?? (res.ok ? t("testEmailSuccess") : t("testEmailFailure")) });
    } catch {
      setTestResult({ ok: false, message: t("networkError") });
    } finally {
      setTestingEmail(false);
    }
  };

  const updateSmtp = (field: keyof SmtpConfig, value: string | number | boolean) => {
    setSettings((s) => ({ ...s, smtp: { ...s.smtp, [field]: value } }));
  };

  if (loading) {
    return (
      <div className="page-container">
        <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} />
        <div className="bg-card rounded-xl border animate-pulse h-48" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <DashboardPageHeader title={t("pageTitle")} description={t("pageDescription")} compact compactOnMobile />

      <section className="workspace-panel-surface rounded-3xl divide-y">
        {/* General */}
        <div className="panel-body space-y-4">
          <h3 className="heading-section font-semibold text-foreground">{t("generalSectionTitle")}</h3>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("platformNameLabel")}</label>
            <Input
              value={settings.platformName}
              onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("supportEmailLabel")}</label>
            <Input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> {t("defaultCurrencyLabel")}
            </label>
            <CurrencySelect
              value={settings.defaultCurrency}
              onValueChange={(v) => setSettings((s) => ({ ...s, defaultCurrency: v }))}
              placeholder={t("defaultCurrencyPlaceholder")}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("defaultCurrencyHelp")}
            </p>
          </div>
        </div>

        {/* Maintenance */}
        <div className="panel-body flex items-center justify-between">
          <div>
            <div className="font-medium text-foreground">{t("maintenanceModeLabel")}</div>
            <div className="text-sm text-muted-foreground">{t("maintenanceModeDescription")}</div>
          </div>
          <Switch
            checked={settings.maintenanceMode}
            onCheckedChange={(checked) => setSettings((s) => ({ ...s, maintenanceMode: checked }))}
            aria-label={t("maintenanceModeLabel")}
          />
        </div>

        {/* Commission Overrides */}
        <div className="panel-body space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="heading-section font-semibold text-foreground flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                {t("commissionOverridesTitle")}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("commissionOverridesDescription")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  commissionOverrides: [...s.commissionOverrides, { countryCode: "", rate: 0, label: "" }],
                }))
              }
            >
              <Plus className="h-4 w-4 mr-1" /> {t("addCommissionButton")}
            </Button>
          </div>

          {settings.commissionOverrides.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_1fr_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>{t("countryCodeHeader")}</span>
                <span>{t("rateHeader")}</span>
                <span className="hidden sm:inline">{t("labelHeader")}</span>
                <span />
              </div>
              {settings.commissionOverrides.map((ov, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-[1fr_80px_1fr_40px] gap-2 items-center">
                  <Input
                    placeholder={t("countryCodePlaceholder")}
                    value={ov.countryCode}
                    maxLength={2}
                    onChange={(e) => {
                      const updated = [...settings.commissionOverrides];
                      updated[idx] = { ...updated[idx], countryCode: e.target.value.toUpperCase() };
                      setSettings((s) => ({ ...s, commissionOverrides: updated }));
                    }}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={ov.rate}
                    onChange={(e) => {
                      const updated = [...settings.commissionOverrides];
                      updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                      setSettings((s) => ({ ...s, commissionOverrides: updated }));
                    }}
                  />
                  <Input
                    placeholder={t("labelPlaceholder")}
                    value={ov.label}
                    onChange={(e) => {
                      const updated = [...settings.commissionOverrides];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setSettings((s) => ({ ...s, commissionOverrides: updated }));
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive p-1"
                    onClick={() => {
                      const updated = settings.commissionOverrides.filter((_, i) => i !== idx);
                      setSettings((s) => ({ ...s, commissionOverrides: updated }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t("noOverridesMessage")}
            </p>
          )}
        </div>

        {/* GDPR */}
        <div className="panel-body space-y-2">
          <h3 className="heading-section font-semibold text-foreground">{t("gdprSectionTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("gdprDescription")}</p>
          <a href="/api/gdpr" target="_blank" className="text-sm text-primary hover:underline">
            {t("gdprLink")}
          </a>
        </div>

        {/* SMTP / Email Configuration */}
        <div className="panel-body space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h3 className="heading-section font-semibold text-foreground">{t("emailConfigTitle")}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("emailConfigDescription")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("smtpEmailLabel")}</label>
              <Input
                type="email"
                placeholder={t("smtpEmailPlaceholder")}
                value={settings.smtp.smtpEmail}
                onChange={(e) => updateSmtp("smtpEmail", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("appPasswordLabel")}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("appPasswordPlaceholder")}
                  value={settings.smtp.smtpAppPassword}
                  onChange={(e) => updateSmtp("smtpAppPassword", e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("appPasswordHelp")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("smtpHostLabel")}</label>
              <Input
                placeholder={t("smtpHostPlaceholder")}
                value={settings.smtp.smtpHost}
                onChange={(e) => updateSmtp("smtpHost", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("smtpPortLabel")}</label>
              <Input
                type="number"
                placeholder={t("smtpPortPlaceholder")}
                value={settings.smtp.smtpPort}
                onChange={(e) => updateSmtp("smtpPort", parseInt(e.target.value) || 587)}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.smtp.smtpSecure}
                  onChange={(e) => updateSmtp("smtpSecure", e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {t("sslTlsLabel")}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestEmail}
              disabled={testingEmail || !settings.smtp.smtpEmail || !settings.smtp.smtpAppPassword}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {testingEmail ? t("testEmailSending") : t("testEmailButton")}
            </Button>
            {testResult && (
              <span className={`text-sm ${testResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      </section>

      <TwoFactorCard />

      <ChangeEmailCard />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("savingSaving") : t("saveButton")}
        </Button>
        {saved && <span className="text-sm text-green-600">{t("saveSuccess")}</span>}
      </div>
    </div>
  );
}
