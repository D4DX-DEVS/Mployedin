"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Mail, Send, Globe } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencySelect } from "@/components/ui/currency-select";

interface SmtpConfig {
  smtpEmail: string;
  smtpAppPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

interface SystemSettings {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultCurrency: string;
  smtp: SmtpConfig;
}

export default function AdminSettingsPage() {
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
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
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
        setTimeout(() => setSaved(false), 2500);
      }
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
      setTestResult({ ok: res.ok, message: data.message ?? (res.ok ? "Test email sent!" : "Failed to send") });
    } catch {
      setTestResult({ ok: false, message: "Network error" });
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
        <PageHeader title="Settings" description="Configure platform-wide settings and preferences" />
        <div className="bg-card rounded-xl border animate-pulse h-48" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader title="Settings" description="Configure platform-wide settings and preferences" />

      <div className="bg-card rounded-xl shadow-sm border divide-y">
        {/* General */}
        <div className="p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">General</h3>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Platform Name</label>
            <Input
              value={settings.platformName}
              onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Support Email</label>
            <Input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings((s) => ({ ...s, supportEmail: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Default Currency
            </label>
            <CurrencySelect
              value={settings.defaultCurrency}
              onValueChange={(v) => setSettings((s) => ({ ...s, defaultCurrency: v }))}
              placeholder="Select currency..."
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Sets the default currency for new commissions and finance summaries.
            </p>
          </div>
        </div>

        {/* Maintenance */}
        <div className="p-5 flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-800">Maintenance Mode</div>
            <div className="text-sm text-muted-foreground">Prevent non-admin users from accessing the platform</div>
          </div>
          <button
            onClick={() => setSettings((s) => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.maintenanceMode ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.maintenanceMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* GDPR */}
        <div className="p-5 space-y-2">
          <h3 className="font-semibold text-gray-800">GDPR & Data</h3>
          <p className="text-sm text-muted-foreground">Data retention, export, and deletion policies are managed via the GDPR API endpoints.</p>
          <a href="/api/gdpr" target="_blank" className="text-sm text-blue-600 hover:underline">
            View GDPR endpoints →
          </a>
        </div>

        {/* SMTP / Email Configuration */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-gray-800">Email Configuration (SMTP)</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure the platform-wide SMTP settings for sending emails via Nodemailer.
            Use a G Suite / Gmail email with an App Password. Employers can optionally override this with their own SMTP in their settings.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">SMTP Email (From address)</label>
              <Input
                type="email"
                placeholder="noreply@yourcompany.com"
                value={settings.smtp.smtpEmail}
                onChange={(e) => updateSmtp("smtpEmail", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">App Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••••••"
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
                For Gmail: Enable 2FA → Generate App Password at myaccount.google.com/apppasswords
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">SMTP Host</label>
              <Input
                placeholder="smtp.gmail.com"
                value={settings.smtp.smtpHost}
                onChange={(e) => updateSmtp("smtpHost", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">SMTP Port</label>
              <Input
                type="number"
                placeholder="587"
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
                Use SSL/TLS (port 465)
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
              {testingEmail ? "Sending…" : "Send Test Email"}
            </Button>
            {testResult && (
              <span className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        {saved && <span className="text-sm text-green-600">✓ Saved</span>}
      </div>
    </div>
  );
}
