"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [platformName, setPlatformName] = useState("MPLOYEDIN");
  const [supportEmail, setSupportEmail] = useState("support@mployedin.com");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const handleSave = async () => {
    // Persist settings via API when endpoint is available
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <PageHeader title="Settings" description="Configure platform-wide settings and preferences" />

      <div className="bg-card rounded-xl shadow-sm border divide-y">
        {/* General */}
        <div className="p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">General</h3>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Platform Name</label>
            <Input
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Support Email</label>
            <Input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
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
            onClick={() => setMaintenanceMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              maintenanceMode ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                maintenanceMode ? "translate-x-6" : "translate-x-1"
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
        <Button onClick={handleSave}>
          Save Changes
        </Button>
        {saved && <span className="text-sm text-green-600">✓ Saved</span>}
      </div>
    </div>
  );
}
