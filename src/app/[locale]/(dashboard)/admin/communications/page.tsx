"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

const USER_ROLES = ["all", "job_seeker", "employer", "agent", "super_agent", "admin"];

interface BroadcastForm {
  title: string;
  message: string;
  targetRoles: string[];
  channels: string[];
  scheduledAt: string;
}

export default function AdminCommunicationsPage() {
  const [tab, setTab] = useState<"broadcast" | "templates" | "history">("broadcast");
  const [form, setForm] = useState<BroadcastForm>({
    title: "",
    message: "",
    targetRoles: ["all"],
    channels: ["in_app"],
    scheduledAt: "",
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const toggleRole = (role: string) => {
    setForm((prev) => {
      if (role === "all") return { ...prev, targetRoles: ["all"] };
      const withoutAll = prev.targetRoles.filter((r) => r !== "all");
      return {
        ...prev,
        targetRoles: withoutAll.includes(role)
          ? withoutAll.filter((r) => r !== role)
          : [...withoutAll, role],
      };
    });
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // POST to /api/admin/communications (to be built)
    await new Promise((r) => setTimeout(r, 800)); // Simulate
    setSent(true);
    setSending(false);
    setTimeout(() => setSent(false), 3000);
  };

  const TEMPLATES = [
    { id: "1", name: "Welcome New User", type: "onboarding", lastUsed: "2024-01-10" },
    { id: "2", name: "Application Received", type: "transactional", lastUsed: "2024-01-12" },
    { id: "3", name: "Interview Reminder", type: "transactional", lastUsed: "2024-01-14" },
    { id: "4", name: "Weekly Job Digest", type: "marketing", lastUsed: "2024-01-08" },
    { id: "5", name: "Platform Maintenance", type: "system", lastUsed: "2023-12-20" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader title="Communications Center" description="Broadcast messages and manage communication templates" />

      <div className="flex gap-1 border rounded-lg p-1 w-fit">
        {(["broadcast", "templates", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${tab === t ? "bg-primary text-white" : "hover:bg-muted/60"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "broadcast" && (
        <div className="max-w-2xl">
          <form onSubmit={handleSend} className="card-base space-y-5">
            <h3 className="font-semibold text-sm">Send Broadcast Message</h3>

            <div className="space-y-1">
              <label className="text-sm font-medium">Title <span className="text-red-500">*</span></label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                required
                placeholder="Message title…"
                className="w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Message <span className="text-red-500">*</span></label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                required
                rows={4}
                placeholder="Write your message here…"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target Audience</label>
              <div className="flex flex-wrap gap-2">
                {USER_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                      form.targetRoles.includes(r)
                        ? "bg-primary text-white border-primary"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    {r === "all" ? "All Users" : r.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Channels</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "in_app", label: "In-App" },
                  { key: "email", label: "Email" },
                  { key: "whatsapp", label: "WhatsApp" },
                ].map((ch) => (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => toggleChannel(ch.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      form.channels.includes(ch.key)
                        ? "bg-primary text-white border-primary"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Schedule (optional)</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                className="w-full h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-xs text-muted-foreground">Leave empty to send immediately</p>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={sending}
                className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {sending ? "Sending…" : form.scheduledAt ? "Schedule" : "Send Now"}
              </button>
              {sent && (
                <span className="text-sm text-green-600 font-medium">
                  ✓ Message sent successfully
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {tab === "templates" && (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Template Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Last Used</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATES.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{t.type}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.lastUsed}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 rounded border hover:bg-muted/40">Edit</button>
                      <button className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">Use</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <div className="card-base">
          <div className="text-center py-12 text-muted-foreground text-sm">
            <p>Broadcast history will appear here</p>
            <p className="text-xs mt-1">Messages sent via the Communications Center are logged here</p>
          </div>
        </div>
      )}
    </div>
  );
}
