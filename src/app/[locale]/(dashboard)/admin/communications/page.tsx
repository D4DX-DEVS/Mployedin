"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowRight,
  Clock,
  FileText,
  History,
  LayoutTemplate,
  Megaphone,
  Pencil,
  Plus,
  Radio,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const USER_ROLES = ["all", "job_seeker", "employer", "agent", "super_agent", "admin"];
const CHANNEL_OPTIONS = [
  { key: "in_app", label: "In-App" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;
const TABS = [
  { key: "broadcast" as const, label: "Broadcast", icon: Radio },
  { key: "templates" as const, label: "Templates", icon: LayoutTemplate },
  { key: "history" as const, label: "History", icon: History },
];
const fieldClassName =
  "w-full rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100";
const panelClassName =
  "rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur";

interface BroadcastForm {
  title: string;
  message: string;
  targetRoles: string[];
  channels: string[];
}

interface BroadcastRecord {
  _id: string;
  title: string;
  body: string;
  channels: string[];
  createdAt: string;
}

interface BroadcastTemplate {
  _id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  createdAt: string;
}

const TEMPLATE_TYPES = ["onboarding", "transactional", "marketing", "system"] as const;

function formatRoleLabel(role: string): string {
  return role === "all" ? "All Users" : role.replace(/_/g, " ");
}

function formatChannelLabel(channel: string): string {
  return CHANNEL_OPTIONS.find((option) => option.key === channel)?.label ?? channel.replace(/_/g, " ");
}

function formatTemplateType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default function AdminCommunicationsPage() {
  const [tab, setTab] = useState<"broadcast" | "templates" | "history">("broadcast");
  const [form, setForm] = useState<BroadcastForm>({
    title: "",
    message: "",
    targetRoles: ["all"],
    channels: ["in_app"],
  });
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", type: "system", subject: "", body: "" });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/communications");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.broadcasts ?? []);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/admin/comm-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void loadTemplates();
  }, [loadHistory, loadTemplates]);

  useEffect(() => {
    if (tab === "history") {
      void loadHistory();
    }
    if (tab === "templates") {
      void loadTemplates();
    }
  }, [tab, loadHistory, loadTemplates]);

  const toggleRole = (role: string) => {
    setForm((prev) => {
      if (role === "all") return { ...prev, targetRoles: ["all"] };
      const withoutAll = prev.targetRoles.filter((r) => r !== "all");
      const nextRoles = withoutAll.includes(role)
        ? withoutAll.filter((r) => r !== role)
        : [...withoutAll, role];

      return {
        ...prev,
        targetRoles: nextRoles.length > 0 ? nextRoles : prev.targetRoles,
      };
    });
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => {
      const nextChannels = prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch];

      return {
        ...prev,
        channels: nextChannels.length > 0 ? nextChannels : prev.channels,
      };
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSentCount(null);
    setSending(true);
    try {
      const targetAll = form.targetRoles.includes("all");
      const targetRoles = targetAll ? undefined : form.targetRoles;

      const res = await fetch("/api/admin/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          targetAll,
          targetRoles,
          channels: form.channels,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSentCount(data.sent ?? 0);
        setForm({ title: "", message: "", targetRoles: ["all"], channels: ["in_app"] });
        toast.success(`Broadcast sent to ${data.sent ?? 0} users`);
        void loadHistory();
        setTimeout(() => setSentCount(null), 4000);
      } else {
        const data = await res.json();
        const msg = data.error ?? "Failed to send broadcast";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setSending(false);
    }
  };

  const handleUseTemplate = (t: BroadcastTemplate) => {
    setForm((prev) => ({ ...prev, title: t.subject, message: t.body }));
    setTab("broadcast");
    toast.success(`Loaded template: ${t.name}`);
  };

  const startEdit = (t: BroadcastTemplate) => {
    setEditId(t._id);
    setTemplateForm({ name: t.name, type: t.type, subject: t.subject, body: t.body });
    setShowCreate(false);
    setTemplateError("");
  };

  const handleSaveTemplate = async (e: React.FormEvent, id?: string) => {
    e.preventDefault();
    setTemplateError("");
    setTemplateSaving(true);
    try {
      const url = id ? `/api/admin/comm-templates/${id}` : "/api/admin/comm-templates";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      });
      if (res.ok) {
        setEditId(null);
        setShowCreate(false);
        setTemplateForm({ name: "", type: "system", subject: "", body: "" });
        toast.success(id ? "Template updated" : "Template created");
        void loadTemplates();
      } else {
        const data = await res.json();
        const message = data.error ?? "Failed to save template";
        setTemplateError(message);
        toast.error(message);
      }
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const template = templates.find((item) => item._id === id);
    const confirmed = window.confirm(
      `Delete${template ? ` "${template.name}"` : ""}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingTemplateId(id);

    try {
      const res = await fetch(`/api/admin/comm-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Template deleted");
        if (editId === id) {
          setEditId(null);
        }
        void loadTemplates();
        return;
      }

      toast.error("Failed to delete template");
    } finally {
      setDeletingTemplateId((current) => (current === id ? null : current));
    }
  };

  const selectedAudience = form.targetRoles.includes("all")
    ? "All platform users"
    : `${form.targetRoles.length} selected role${form.targetRoles.length === 1 ? "" : "s"}`;
  const selectedChannels = form.channels.length;
  const quickTemplates = templates.slice(0, 3);

  return (
    <div className="page-container space-y-4">
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Communications Center</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Broadcast announcements, manage templates, and review delivery history.</p>
          </div>
          <div className="inline-flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-secondary/50 p-1">
            {TABS.map((tabOption) => {
              const active = tab === tabOption.key;
              return (
                <button
                  key={tabOption.key}
                  type="button"
                  onClick={() => setTab(tabOption.key)}
                  aria-label={`Switch to ${tabOption.label} tab`}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  <tabOption.icon className="h-3.5 w-3.5" />
                  {tabOption.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {tab === "broadcast" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <form onSubmit={handleSend} className={`${panelClassName} space-y-6`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Live broadcast</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Send a message across the platform</h2>
                <p className="mt-1 text-sm text-slate-500">Compose the message once, choose the audience, and deliver it immediately.</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
                <p className="font-semibold">{form.channels.length} channel{form.channels.length === 1 ? "" : "s"} selected</p>
                <p className="mt-1 text-xs text-sky-700">Every selected channel receives the same message body.</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  required
                  placeholder="Platform update, policy alert, onboarding reminder..."
                  className={fieldClassName}
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Message <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
                  required
                  rows={6}
                  placeholder="Write the exact message recipients should receive. Keep the opening clear and action oriented."
                  className={`${fieldClassName} min-h-[160px] resize-y`}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Target audience</label>
                <span className="text-xs text-slate-500">{selectedAudience}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {USER_ROLES.map((role) => {
                  const active = form.targetRoles.includes(role);

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium capitalize transition ${
                        active
                          ? "border-sky-200 bg-sky-600 text-white shadow-[0_16px_30px_-22px_rgba(2,132,199,0.7)]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-slate-950"
                      }`}
                    >
                      {formatRoleLabel(role)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Channels</label>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  Sends immediately on submission
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CHANNEL_OPTIONS.map((channel) => {
                  const active = form.channels.includes(channel.key);

                  return (
                    <button
                      key={channel.key}
                      type="button"
                      onClick={() => toggleChannel(channel.key)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                        active
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:text-slate-950"
                      }`}
                    >
                      {channel.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {sentCount !== null ? (
                  <span className="font-medium text-emerald-600">Sent to {sentCount} users.</span>
                ) : (
                  "Messages are stored in history once delivery starts."
                )}
              </div>
              <Button type="submit" disabled={sending} className="h-11 gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700">
                <Send className="h-4 w-4" />
                {sending ? "Sending..." : "Send Now"}
              </Button>
            </div>
          </form>

          <div className="space-y-6">
            <aside className={panelClassName}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery notes</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Keep the message operationally clear</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  Start with the action recipients need to take.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  Reuse templates for repeat announcements to keep wording consistent.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  Limit channels to the ones that matter so the message does not feel noisy.
                </div>
              </div>
            </aside>

            <aside className={panelClassName}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick start</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Recent templates</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("templates")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-800"
                >
                  Manage
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {templatesLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                  ))
                ) : quickTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
                    No templates yet. Create one from the Templates tab to speed up repeat broadcasts.
                  </div>
                ) : (
                  quickTemplates.map((template) => (
                    <div key={template._id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{template.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{formatTemplateType(template.type)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleUseTemplate(template)}
                          className="h-9 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        >
                          Use
                        </Button>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{template.subject}</p>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="space-y-6">
          <div className={`${panelClassName} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reusable content</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Template library</h2>
              <p className="mt-1 text-sm text-slate-500">Keep repeat announcements structured and ready to send.</p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setShowCreate((current) => !current);
                setEditId(null);
                setTemplateForm({ name: "", type: "system", subject: "", body: "" });
                setTemplateError("");
              }}
              className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              {showCreate ? "Cancel" : "New Template"}
            </Button>
          </div>

          {showCreate ? (
            <form onSubmit={(e) => handleSaveTemplate(e)} className={`${panelClassName} space-y-5`}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Create template</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">Save a message pattern for later</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="New user activation"
                    className={fieldClassName}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={templateForm.type}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, type: e.target.value }))}
                    className={fieldClassName}
                  >
                    {TEMPLATE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {formatTemplateType(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Subject / Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, subject: e.target.value }))}
                    placeholder="Your account is ready"
                    className={fieldClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Body <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={templateForm.body}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, body: e.target.value }))}
                    placeholder="Write the reusable message body here..."
                    className={`${fieldClassName} min-h-[150px] resize-y`}
                  />
                </div>
              </div>

              {templateError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {templateError}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={templateSaving} className="h-11 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700">
                  {templateSaving ? "Saving..." : "Save Template"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className={`${panelClassName} space-y-4`}>
            {templatesLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-14 text-center text-sm text-slate-500">
                <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                No templates yet. Create one to keep recurring broadcasts consistent.
              </div>
            ) : (
              templates.map((template) => (
                <div key={template._id} className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold tracking-tight text-slate-950">{template.name}</h3>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {formatTemplateType(template.type)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{template.subject}</p>
                      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{template.body}</p>
                      <p className="text-xs text-slate-500">Created {new Date(template.createdAt).toLocaleDateString()}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startEdit(template)}
                        className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleUseTemplate(template)}
                        className="h-10 gap-2 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        <Megaphone className="h-4 w-4" />
                        Use Template
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDeleteTemplate(template._id)}
                        disabled={deletingTemplateId === template._id}
                        className="h-10 gap-2 rounded-xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingTemplateId === template._id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>

                  {editId === template._id ? (
                    <form onSubmit={(e) => handleSaveTemplate(e, template._id)} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Name</label>
                          <input
                            required
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, name: e.target.value }))}
                            className={fieldClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</label>
                          <select
                            required
                            value={templateForm.type}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, type: e.target.value }))}
                            className={fieldClassName}
                          >
                            {TEMPLATE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {formatTemplateType(type)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Subject</label>
                          <input
                            required
                            value={templateForm.subject}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, subject: e.target.value }))}
                            className={fieldClassName}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Body</label>
                          <textarea
                            required
                            rows={4}
                            value={templateForm.body}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, body: e.target.value }))}
                            className={`${fieldClassName} min-h-[140px] resize-y`}
                          />
                        </div>
                      </div>

                      {templateError ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          {templateError}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setEditId(null)} className="h-10 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={templateSaving} className="h-10 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700">
                          {templateSaving ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={`${panelClassName} space-y-4`}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sent broadcasts</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Recent delivery activity</h2>
            <p className="mt-1 text-sm text-slate-500">Review what was sent, when it was delivered, and which primary channel was used.</p>
          </div>

          {historyLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))
          ) : history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-14 text-center text-sm text-slate-500">
              <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              No broadcasts sent yet. Messages sent from the Broadcast tab will appear here.
            </div>
          ) : (
            history.map((record) => (
              <article key={record._id} className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-slate-950">{record.title}</h3>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {formatChannelLabel(record.channels?.[0] ?? "in_app")}
                      </span>
                    </div>
                    <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">{record.body}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sent</p>
                    <p className="mt-2 font-medium text-slate-900">{new Date(record.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
