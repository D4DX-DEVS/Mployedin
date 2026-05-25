"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Copy, Trash2, Search, FileText, Inbox, RotateCcw,
  Briefcase, Clock, Edit,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobTemplate {
  _id: string;
  name: string;
  title: string;
  description?: string;
  requirements?: string;
  jobType?: string;
  experienceLevel?: string;
  skills?: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmployerJobTemplatesPage() {
  const t = useTranslations("employerJobTemplates");
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", title: "", description: "", requirements: "",
    jobType: "full_time", experienceLevel: "mid",
    skills: "",
  });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/employer/job-templates?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.items ?? []);
      }
    } catch {
      toast.error(t("toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = async () => {
    if (!form.name.trim() || !form.title.trim()) {
      toast.error(t("toastRequired"));
      return;
    }
    try {
      const res = await csrfFetch("/api/employer/job-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        toast.success(t("toastCreated"));
        setForm({ name: "", title: "", description: "", requirements: "", jobType: "full_time", experienceLevel: "mid", skills: "" });
        setShowForm(false);
        fetchTemplates();
      }
    } catch {
      toast.error(t("toastCreateFailed"));
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/employer/job-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("toastDeleted"));
        fetchTemplates();
      }
    } catch {
      toast.error(t("toastDeleteFailed"));
    }
  };

  const useTemplate = (tmpl: JobTemplate) => {
    // Navigate to job creation with template data pre-filled
    const params = new URLSearchParams({ template: tmpl._id });
    window.location.href = `/employer/jobs/new?${params}`;
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> {t("newTemplate")}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("totalTemplates")}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{templates.length}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("timesUsed")}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {templates.reduce((sum, t) => sum + (t.usageCount || 0), 0)}
            </p>
          </div>
        </div>
      </section>

      {/* Create Form */}
      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("createTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder={t("templateName")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder={t("jobTitle")} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            <textarea
              placeholder={t("jobDescription")}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="sm:col-span-2 min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder={t("requirements")}
              value={form.requirements}
              onChange={(e) => setForm((p) => ({ ...p, requirements: e.target.value }))}
              className="sm:col-span-2 min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Input placeholder={t("skills")} value={form.skills} onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))} className="sm:col-span-2" />
          </div>
          <div className="flex gap-2">
            <Button onClick={createTemplate}><Plus className="mr-1 h-4 w-4" /> {t("create")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
        </section>
      )}

      {/* Search */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <RotateCcw className="mr-1 h-4 w-4" /> {t("reset")}
          </Button>
        </div>
      </section>

      {/* Template Grid */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("noTemplates")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("noTemplatesDesc")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((tmpl) => (
              <div key={tmpl._id} className="workspace-glass-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">{tmpl.title}</p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground/50" />
                </div>

                {tmpl.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
                )}

                {tmpl.skills && tmpl.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tmpl.skills.slice(0, 4).map((s) => (
                      <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
                    ))}
                    {tmpl.skills.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{tmpl.skills.length - 4}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">{t("usedTimes", { count: tmpl.usageCount || 0 })}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => useTemplate(tmpl)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> {t("use")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteTemplate(tmpl._id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
