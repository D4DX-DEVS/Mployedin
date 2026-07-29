"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Plus, Trash2, ExternalLink, FolderOpen, Inbox,
  Github, Globe, Image, Edit,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { PageHero } from "@/components/shared/PageHero";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Project {
  _id: string;
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
  technologies: string[];
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PortfolioPage() {
  const t = useTranslations("jobSeekerExtra.portfolio");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", url: "", imageUrl: "",
    technologies: "", startDate: "", endDate: "",
  });

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/portfolio");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.items ?? []);
      }
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error(t("required"));
      return;
    }
    try {
      const res = await csrfFetch("/api/user/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          technologies: form.technologies.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        toast.success(t("added"));
        setForm({ title: "", description: "", url: "", imageUrl: "", technologies: "", startDate: "", endDate: "" });
        setShowForm(false);
        fetchProjects();
      }
    } catch {
      toast.error(t("addFailed"));
    }
  };

  const deleteProject = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/user/portfolio/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("removed"));
        fetchProjects();
      }
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHero
        icon={FolderOpen}
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="me-1 h-4 w-4" /> {t("addProject")}
          </Button>
        }
      />

      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-3 sm:p-5 space-y-3 sm:space-y-4">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">{t("addProject")}</h2>
          <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
            <Input placeholder={t("projectTitlePlaceholder")} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            <Input placeholder={t("urlPlaceholder")} value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
            <textarea
              placeholder={t("descriptionPlaceholder")}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="sm:col-span-2 min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Input placeholder={t("technologiesPlaceholder")} value={form.technologies} onChange={(e) => setForm((p) => ({ ...p, technologies: e.target.value }))} className="sm:col-span-2" />
            <Input placeholder={t("imagePlaceholder")} value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} className="sm:col-span-2" />
            <DateTimePicker mode="date" value={form.startDate} onChange={(val) => setForm((p) => ({ ...p, startDate: val }))} />
            <DateTimePicker mode="date" value={form.endDate} onChange={(val) => setForm((p) => ({ ...p, endDate: val }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createProject}><Plus className="me-1 h-4 w-4" /> {t("add")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
        </section>
      )}

      <section className="workspace-panel-surface rounded-[28px] p-3 sm:p-5">
        {loading ? (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel rounded-2xl overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <div className="p-3 sm:p-5 space-y-2 sm:space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 sm:py-16 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/40 sm:h-12 sm:w-12" />
            <p className="mt-2 text-xs font-medium text-muted-foreground sm:mt-4 sm:text-sm">{t("empty")}</p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div key={project._id} className="workspace-glass-panel rounded-2xl overflow-hidden">
                {project.imageUrl && (
                  <div className="h-40 bg-muted">
                    <img
                      src={project.imageUrl}
                      alt={project.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="p-3 sm:p-5 space-y-2 sm:space-y-3">
                  <div className="flex items-start justify-between">
                    <p className="text-xs font-semibold text-foreground sm:text-sm">{project.title}</p>
                    <Button variant="ghost" size="sm" onClick={() => deleteProject(project._id)}>
                      <Trash2 className="h-3 w-3 text-red-400 sm:h-3.5 sm:w-3.5" />
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground line-clamp-3 sm:text-xs">{project.description}</p>

                  {project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:gap-1.5">
                      {project.technologies.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    {(project.startDate || project.endDate) && (
                      <span className="text-[10px] text-muted-foreground">
                        {project.startDate ? new Date(project.startDate).toLocaleDateString(numberLocale) : ""}
                        {project.startDate && project.endDate ? " — " : ""}
                        {project.endDate ? new Date(project.endDate).toLocaleDateString(numberLocale) : t("present")}
                      </span>
                    )}
                    {project.url && (
                      <a href={project.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> {t("view")}
                      </a>
                    )}
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
