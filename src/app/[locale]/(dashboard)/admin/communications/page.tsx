"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const USER_ROLES = ["all", "job_seeker", "employer", "agent", "super_agent", "admin"];
const TEMPLATE_TYPES_ARRAY = ["onboarding", "transactional", "marketing", "system"] as const;
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

export default function AdminCommunicationsPage() {
  const tr = useTranslations("adminCommunications");
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
  const [historySearch, setHistorySearch] = useState("");
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
        toast.success(tr("sentToUsers", { count: data.sent ?? 0 }));
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

  const handleUseTemplate = (template: BroadcastTemplate) => {
    setForm((prev) => ({ ...prev, title: template.subject, message: template.body }));
    setTab("broadcast");
    toast.success(tr("recentTemplates"));
  };

  const startEdit = (template: BroadcastTemplate) => {
    setEditId(template._id);
    setTemplateForm({ name: template.name, type: template.type, subject: template.subject, body: template.body });
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
        toast.success(id ? tr("templateUpdated") : tr("templateCreated"));
        void loadTemplates();
      } else {
        const data = await res.json();
        const message = data.error ?? tr("templateDeleteFailed");
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
      tr("deleteTemplateConfirm", { template: template?.name || "EMPTY" })
    );

    if (!confirmed) {
      return;
    }

    setDeletingTemplateId(id);

    try {
      const res = await fetch(`/api/admin/comm-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(tr("templateDeleted"));
        if (editId === id) {
          setEditId(null);
        }
        void loadTemplates();
        return;
      }

      toast.error(tr("templateDeleteFailed"));
    } finally {
      setDeletingTemplateId((current) => (current === id ? null : current));
    }
  };

  const selectedAudience = form.targetRoles.includes("all")
    ? tr("allPlatformUsers")
    : tr("selectedRoles", { count: form.targetRoles.length });
  const selectedChannels = form.channels.length;
  const quickTemplates = templates.slice(0, 3);

  const CHANNEL_OPTIONS = [
    { key: "in_app", label: tr("inAppChannel") },
    { key: "email", label: tr("emailChannel") },
    { key: "whatsapp", label: tr("whatsappChannel") },
  ] as const;

  const TABS = [
    { key: "broadcast" as const, label: tr("broadcastTabLabel"), icon: Radio },
    { key: "templates" as const, label: tr("templatesTabLabel"), icon: LayoutTemplate },
    { key: "history" as const, label: tr("historyTabLabel"), icon: History },
  ];

  const formatRoleLabel = (role: string): string => {
    const roleMap: Record<string, string> = {
      all: tr("allUsersRole"),
      job_seeker: tr("jobSeekerRole"),
      employer: tr("employerRole"),
      agent: tr("agentRole"),
      super_agent: tr("superAgentRole"),
      admin: tr("adminRole"),
    };
    return roleMap[role] || role.replace(/_/g, " ");
  };

  const formatChannelLabel = (channel: string): string => {
    return CHANNEL_OPTIONS.find((option) => option.key === channel)?.label ?? channel.replace(/_/g, " ");
  };

  const formatTemplateType = (type: string): string => {
    const typeMap: Record<string, string> = {
      onboarding: tr("onboardingType"),
      transactional: tr("transactionalType"),
      marketing: tr("marketingType"),
      system: tr("systemType"),
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div className="page-container space-y-4">
      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {tr("adminWorkspace")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{tr("communicationsCenterHeading")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {tr("communicationsCenterDesc")}
            </p>
          </div>
        </div>
      </section>

      {/* ── Tab Navigation ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((tabOption) => {
            const active = tab === tabOption.key;
            return (
              <button
                key={tabOption.key}
                type="button"
                onClick={() => setTab(tabOption.key)}
                aria-label={
                  tabOption.key === "broadcast"
                    ? tr("switchToBroadcastTab")
                    : tabOption.key === "templates"
                      ? tr("switchToTemplatesTab")
                      : tr("switchToHistoryTab")
                }
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
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
      </section>

      {tab === "broadcast" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <form onSubmit={handleSend} className={`${panelClassName} space-y-6`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("liveBroadcast")}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{tr("sendMessageTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500">{tr("sendMessageDesc")}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
                <p className="font-semibold">{tr("channelsSelected", { count: form.channels.length })}</p>
                <p className="mt-1 text-xs text-sky-700">{tr("channelDeliveryNote")}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {tr("titleLabel")} <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  required
                  placeholder={tr("titlePlaceholder")}
                  className={fieldClassName}
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {tr("messageLabel")} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))}
                  required
                  rows={6}
                  placeholder={tr("messagePlaceholder")}
                  className={`${fieldClassName} min-h-[160px] resize-y`}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("targetAudienceLabel")}</label>
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
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("channelsLabel")}</label>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {tr("sendsImmediately")}
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
                  <span className="font-medium text-emerald-600">{tr("sentToUsers", { count: sentCount })}</span>
                ) : (
                  tr("messagesStored")
                )}
              </div>
              <Button type="submit" disabled={sending} className="h-11 gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700">
                <Send className="h-4 w-4" />
                {sending ? tr("sending") : tr("sendNow")}
              </Button>
            </div>
          </form>

          <div className="space-y-6">
            <aside className={panelClassName}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("deliveryNotes")}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{tr("keepMessageClear")}</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  {tr("deliveryNote1")}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  {tr("deliveryNote2")}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  {tr("deliveryNote3")}
                </div>
              </div>
            </aside>

            <aside className={panelClassName}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("quickStart")}</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{tr("recentTemplates")}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("templates")}
                  className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-800"
                >
                  {tr("manageTemplates")}
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
                    {tr("noTemplatesYet")}
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
                          {tr("useTemplateButton")}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("reusableContent")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{tr("templateLibrary")}</h2>
              <p className="mt-1 text-sm text-slate-500">{tr("templateLibraryDesc")}</p>
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
              {showCreate ? tr("cancelButton") : tr("newTemplateButton")}
            </Button>
          </div>

          {showCreate ? (
            <form onSubmit={(e) => handleSaveTemplate(e)} className={`${panelClassName} space-y-5`}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("createTemplateHeading")}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{tr("createTemplateSub")}</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr("nameLabel")} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder={tr("namePlaceholder")}
                    className={fieldClassName}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr("typeLabel")} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={templateForm.type}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, type: e.target.value }))}
                    className={fieldClassName}
                  >
                    {TEMPLATE_TYPES_ARRAY.map((type) => (
                      <option key={type} value={type}>
                        {formatTemplateType(type)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr("subjectLabel")} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={templateForm.subject}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, subject: e.target.value }))}
                    placeholder={tr("subjectPlaceholder")}
                    className={fieldClassName}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr("bodyLabel")} <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={templateForm.body}
                    onChange={(e) => setTemplateForm((current) => ({ ...current, body: e.target.value }))}
                    placeholder={tr("bodyPlaceholder")}
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
                  {templateSaving ? tr("saving") : tr("saveTemplate")}
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
                {tr("noTemplatesInLibrary")}
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
                        {tr("editButton")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleUseTemplate(template)}
                        className="h-10 gap-2 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        <Megaphone className="h-4 w-4" />
                        {tr("useTemplateAction")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDeleteTemplate(template._id)}
                        disabled={deletingTemplateId === template._id}
                        className="h-10 gap-2 rounded-xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingTemplateId === template._id ? tr("deleting") : tr("deleteButton")}
                      </Button>
                    </div>
                  </div>

                  {editId === template._id ? (
                    <form onSubmit={(e) => handleSaveTemplate(e, template._id)} className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("nameLabel")}</label>
                          <input
                            required
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, name: e.target.value }))}
                            className={fieldClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("templateType")}</label>
                          <select
                            required
                            value={templateForm.type}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, type: e.target.value }))}
                            className={fieldClassName}
                          >
                            {TEMPLATE_TYPES_ARRAY.map((type) => (
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
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("bodyLabel")}</label>
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
                          {tr("cancelButton")}
                        </Button>
                        <Button type="submit" disabled={templateSaving} className="h-10 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700">
                          {templateSaving ? tr("saving") : tr("saveTemplate")}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("broadcastHistoryHead")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{tr("recentActivityHeading")}</h2>
            <p className="mt-1 text-sm text-slate-500">{tr("recentActivityDesc")}</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder={tr("searchPlaceholder")} value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9 h-9 text-sm border-slate-200 bg-white" />
          </div>

          {historyLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))
          ) : history.filter((r) => r.title.toLowerCase().includes(historySearch.toLowerCase()) || r.body?.toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-14 text-center text-sm text-slate-500">
              <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              {history.length === 0 ? tr("noBroadcastsSent") : tr("noSearchResults")}
            </div>
          ) : (
            history.filter((r) => r.title.toLowerCase().includes(historySearch.toLowerCase()) || r.body?.toLowerCase().includes(historySearch.toLowerCase())).map((record) => (
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{tr("sentLabel")}</p>
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
