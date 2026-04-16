"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SystemSettings {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
}

export default function AdminSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemSettings>({
    platformName: "MPLOYEDIN",
    supportEmail: "support@mployedin.com",
    maintenanceMode: false,
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
