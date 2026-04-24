"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
      toast.error("Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
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
        toast.success("Project added");
        setForm({ title: "", description: "", url: "", imageUrl: "", technologies: "", startDate: "", endDate: "" });
        setShowForm(false);
        fetchProjects();
      }
    } catch {
      toast.error("Failed to add project");
    }
  };

  const deleteProject = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/user/portfolio/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Project removed");
        fetchProjects();
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Portfolio & Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Showcase your work, side projects, and achievements to employers
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Project
          </Button>
        </div>
      </section>

      {/* Create Form */}
      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Add Project</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Project title *" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            <Input placeholder="Project URL (optional)" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
            <textarea
              placeholder="Description *"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="sm:col-span-2 min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Input placeholder="Technologies (comma-separated)" value={form.technologies} onChange={(e) => setForm((p) => ({ ...p, technologies: e.target.value }))} className="sm:col-span-2" />
            <Input placeholder="Image URL (optional)" value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} className="sm:col-span-2" />
            <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createProject}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </section>
      )}

      {/* Projects Grid */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No projects yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Add your first project to showcase your work</p>
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
                        {project.startDate ? new Date(project.startDate).toLocaleDateString() : ""}
                        {project.startDate && project.endDate ? " — " : ""}
                        {project.endDate ? new Date(project.endDate).toLocaleDateString() : "Present"}
                      </span>
                    )}
                    {project.url && (
                      <a href={project.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> View
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
