"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, ExternalLink, FolderOpen, Inbox,
  Github, Globe, Image, Edit,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

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
    <div className="space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="me-1 h-4 w-4" /> {t("addProject")}
          </Button>
        </div>
      </section>

      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("addProject")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createProject}><Plus className="me-1 h-4 w-4" /> {t("add")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
        </section>
      )}

      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel rounded-2xl overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("emptyDescription")}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-foreground">{project.title}</p>
                    <Button variant="ghost" size="sm" onClick={() => deleteProject(project._id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-3">{project.description}</p>

                  {project.technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1">
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
