"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Send, Clock, Megaphone, FileText, History } from "lucide-react";

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
    await new Promise((r) => setTimeout(r, 800));
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

  const TABS = [
    { key: "broadcast" as const, label: "Broadcast", icon: Megaphone },
    { key: "templates" as const, label: "Templates", icon: FileText },
    { key: "history" as const, label: "History", icon: History },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Communications Center" description="Broadcast messages and manage communication templates" />

      <div className="flex gap-1 border rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn flex items-center gap-1.5 ${tab === t.key ? "active" : ""}`}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "broadcast" && (
        <div className="max-w-2xl">
          <form onSubmit={handleSend} className="card-base space-y-5">
            <h3 className="font-semibold text-sm">Send Broadcast Message</h3>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                required
                placeholder="Message title…"
                className="input-field"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message <span className="text-destructive">*</span></label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                required
                rows={4}
                placeholder="Write your message here…"
                className="textarea-field"
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
                    className={`btn-pill capitalize ${form.targetRoles.includes(r) ? "active" : ""}`}
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
                    className={`btn-pill ${form.channels.includes(ch.key) ? "active" : ""}`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Schedule (optional)
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
                className="input-field"
              />
              <p className="text-xs text-muted-foreground">Leave empty to send immediately</p>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={sending} className="btn-primary flex items-center gap-2">
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : form.scheduledAt ? "Schedule" : "Send Now"}
              </button>
              {sent && (
                <span className="text-sm text-emerald-600 font-medium">
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
                <th className="px-4 py-3 font-medium">Template Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATES.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{t.type}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.lastUsed}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="btn-outline h-7 px-2.5 text-xs">Edit</button>
                      <button className="btn-primary h-7 px-2.5 text-xs">Use</button>
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
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Broadcast history will appear here</p>
            <p className="text-xs mt-1">Messages sent via the Communications Center are logged here</p>
          </div>
        </div>
      )}
    </div>
  );
}
