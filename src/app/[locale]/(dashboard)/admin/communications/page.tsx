"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDate, formatDateTime } from "@/lib/ui/intlFormat";

const USER_ROLES = ["all", "job_seeker", "employer", "agent", "super_agent", "admin"];
const TEMPLATE_TYPES_ARRAY = ["onboarding", "transactional", "marketing", "system"] as const;
const fieldClassName =
  "w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/20";
const panelClassName =
  "rounded-3xl border border-border bg-card/95 p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)] backdrop-blur";

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
  const { confirm, ConfirmDialogNode } = useConfirm();
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
    const confirmed = await confirm({
      message: tr("deleteTemplateConfirm", { template: template?.name || "EMPTY" })
    });

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
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero
        compact
        compactOnMobile
        title={tr("communicationsCenterHeading")}
        description={tr("communicationsCenterDesc")}
      />

      {/* ── Tab Navigation ── */}
      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
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
                    ? "bg-primary text-primary-foreground shadow-sm"
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
        <section className="grid gap-3 sm:gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <form onSubmit={handleSend} className={`${panelClassName} space-y-3 sm:space-y-6`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("liveBroadcast")}</p>
                <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{tr("sendMessageTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tr("sendMessageDesc")}</p>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                <p className="font-semibold">{tr("channelsSelected", { count: form.channels.length })}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tr("channelDeliveryNote")}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("targetAudienceLabel")}</label>
                <span className="text-xs text-muted-foreground">{selectedAudience}</span>
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
                          ? "border-primary/40 bg-primary text-primary-foreground shadow-[0_16px_30px_-22px_rgba(2,132,199,0.7)]"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
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
                <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("channelsLabel")}</label>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
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
              <div className="text-sm text-muted-foreground">
                {sentCount !== null ? (
                  <span className="font-medium text-emerald-600">{tr("sentToUsers", { count: sentCount })}</span>
                ) : (
                  tr("messagesStored")
                )}
              </div>
              <Button type="submit" disabled={sending} size="lg" className="gap-2 rounded-xl px-5">
                <Send className="h-4 w-4" />
                {sending ? tr("sending") : tr("sendNow")}
              </Button>
            </div>
          </form>

          <div className="space-y-3 sm:space-y-6">
            <aside className={panelClassName}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("deliveryNotes")}</p>
              <h3 className="heading-subsection mt-2 font-semibold tracking-tight text-foreground">{tr("keepMessageClear")}</h3>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3">
                  {tr("deliveryNote1")}
                </div>
                <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3">
                  {tr("deliveryNote2")}
                </div>
                <div className="rounded-2xl border border-border bg-muted/70 px-4 py-3">
                  {tr("deliveryNote3")}
                </div>
              </div>
            </aside>

            <aside className={panelClassName}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("quickStart")}</p>
                  <h3 className="heading-subsection mt-2 font-semibold tracking-tight text-foreground">{tr("recentTemplates")}</h3>
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
                    <div key={index} className="h-24 animate-pulse rounded-2xl bg-secondary" />
                  ))
                ) : quickTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    {tr("noTemplatesYet")}
                  </div>
                ) : (
                  quickTemplates.map((template) => (
                    <div key={template._id} className="rounded-2xl border border-border bg-muted/60 card-pad">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{template.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">{formatTemplateType(template.type)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleUseTemplate(template)}
                          className="h-9 rounded-xl border-border bg-card text-foreground hover:bg-secondary"
                        >
                          {tr("useTemplateButton")}
                        </Button>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{template.subject}</p>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="space-y-3 sm:space-y-6">
          <div className={`${panelClassName} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("reusableContent")}</p>
              <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{tr("templateLibrary")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tr("templateLibraryDesc")}</p>
            </div>
            <Button
              type="button"
              onClick={() => {
                setShowCreate((current) => !current);
                setEditId(null);
                setTemplateForm({ name: "", type: "system", subject: "", body: "" });
                setTemplateError("");
              }}
              size="lg"
              className="h-11 gap-2 rounded-xl px-4"
            >
              <Plus className="h-4 w-4" />
              {showCreate ? tr("cancelButton") : tr("newTemplateButton")}
            </Button>
          </div>

          {showCreate ? (
            <form onSubmit={(e) => handleSaveTemplate(e)} className={`${panelClassName} space-y-5`}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("createTemplateHeading")}</p>
                <h3 className="heading-subsection mt-2 font-semibold tracking-tight text-foreground">{tr("createTemplateSub")}</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {tr("typeLabel")} <span className="text-rose-500">*</span>
                  </label>
                  <Select value={templateForm.type} onValueChange={(v) => setTemplateForm((current) => ({ ...current, type: v }))}>
                    <SelectTrigger className={fieldClassName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES_ARRAY.map((type) => (
                        <SelectItem key={type} value={type}>
                          {formatTemplateType(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
                <Button type="submit" disabled={templateSaving} size="lg" className="rounded-xl px-5">
                  {templateSaving ? tr("saving") : tr("saveTemplate")}
                </Button>
              </div>
            </form>
          ) : null}

          <div className={`${panelClassName} space-y-4`}>
            {templatesLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl bg-secondary" />
              ))
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/60 px-4 py-14 text-center text-sm text-muted-foreground">
                <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                {tr("noTemplatesInLibrary")}
              </div>
            ) : (
              templates.map((template) => (
                <div key={template._id} className="rounded-3xl border border-border bg-muted/50 panel-body">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="heading-subsection font-semibold tracking-tight text-foreground">{template.name}</h3>
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {formatTemplateType(template.type)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{template.subject}</p>
                      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{template.body}</p>
                      <p className="text-xs text-muted-foreground">Created {formatDate(new Date(template.createdAt))}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startEdit(template)}
                        className="h-10 gap-2 rounded-xl border-border bg-card text-foreground hover:bg-secondary"
                      >
                        <Pencil className="h-4 w-4" />
                        {tr("editButton")}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleUseTemplate(template)}
                        size="sm"
                        className="h-10 gap-2 rounded-xl"
                      >
                        <Megaphone className="h-4 w-4" />
                        {tr("useTemplateAction")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDeleteTemplate(template._id)}
                        disabled={deletingTemplateId === template._id}
                        className="h-10 gap-2 rounded-xl border-rose-200 bg-card text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingTemplateId === template._id ? tr("deleting") : tr("deleteButton")}
                      </Button>
                    </div>
                  </div>

                  {editId === template._id ? (
                    <form onSubmit={(e) => handleSaveTemplate(e, template._id)} className="mt-5 space-y-4 rounded-2xl border border-border bg-card card-pad">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("nameLabel")}</label>
                          <input
                            required
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, name: e.target.value }))}
                            className={fieldClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("templateType")}</label>
                          <Select value={templateForm.type} onValueChange={(v) => setTemplateForm((current) => ({ ...current, type: v }))}>
                            <SelectTrigger className={fieldClassName}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMPLATE_TYPES_ARRAY.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {formatTemplateType(type)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("subjectLabel")}</label>
                          <input
                            required
                            value={templateForm.subject}
                            onChange={(e) => setTemplateForm((current) => ({ ...current, subject: e.target.value }))}
                            className={fieldClassName}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("bodyLabel")}</label>
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
                        <Button type="button" variant="outline" onClick={() => setEditId(null)} className="h-10 rounded-xl border-border bg-card text-foreground hover:bg-secondary">
                          {tr("cancelButton")}
                        </Button>
                        <Button type="submit" disabled={templateSaving} size="sm" className="h-10 rounded-xl">
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("broadcastHistoryHead")}</p>
            <h2 className="heading-section mt-2 font-semibold tracking-tight text-foreground">{tr("recentActivityHeading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tr("recentActivityDesc")}</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder={tr("searchPlaceholder")} value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9 h-9 text-sm border-border bg-card" />
          </div>

          {historyLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-secondary" />
            ))
          ) : history.filter((r) => r.title.toLowerCase().includes(historySearch.toLowerCase()) || r.body?.toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/60 px-4 py-14 text-center text-sm text-muted-foreground">
              <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              {history.length === 0 ? tr("noBroadcastsSent") : tr("noSearchResults")}
            </div>
          ) : (
            history.filter((r) => r.title.toLowerCase().includes(historySearch.toLowerCase()) || r.body?.toLowerCase().includes(historySearch.toLowerCase())).map((record) => (
              <article key={record._id} className="rounded-3xl border border-border bg-muted/50 panel-body">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="heading-subsection font-semibold tracking-tight text-foreground">{record.title}</h3>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {formatChannelLabel(record.channels?.[0] ?? "in_app")}
                      </span>
                    </div>
                    <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{record.body}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("sentLabel")}</p>
                    <p className="mt-2 font-medium text-foreground">{formatDateTime(new Date(record.createdAt))}</p>
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
