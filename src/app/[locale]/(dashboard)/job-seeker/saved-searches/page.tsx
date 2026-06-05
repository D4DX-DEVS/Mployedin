"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bell, Plus, Trash2, Search, Inbox, RotateCcw, Mail,
  BellRing, Briefcase, MapPin, Clock,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SavedSearch {
  _id: string;
  name: string;
  query: string;
  filters: {
    location?: string;
    jobType?: string;
    experienceLevel?: string;
    salary?: string;
  };
  emailAlert: boolean;
  frequency: "daily" | "weekly" | "never";
  lastNotifiedAt?: string;
  resultCount?: number;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SavedSearchesPage() {
  const t = useTranslations("jobSeekerExtra.savedSearches");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", query: "", location: "", jobType: "",
    frequency: "weekly",
  });

  const fetchSearches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/saved-searches");
      if (res.ok) {
        const data = await res.json();
        setSearches(data.items ?? []);
      }
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchSearches(); }, [fetchSearches]);

  const createSearch = async () => {
    if (!form.name.trim() || !form.query.trim()) {
      toast.error(t("required"));
      return;
    }
    try {
      const res = await csrfFetch("/api/user/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          query: form.query.trim(),
          filters: {
            location: form.location || undefined,
            jobType: form.jobType || undefined,
          },
          frequency: form.frequency,
          emailAlert: form.frequency !== "never",
        }),
      });
      if (res.ok) {
        toast.success(t("created"));
        setForm({ name: "", query: "", location: "", jobType: "", frequency: "weekly" });
        setShowForm(false);
        fetchSearches();
      }
    } catch {
      toast.error(t("createFailed"));
    }
  };

  const deleteSearch = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/user/saved-searches/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        fetchSearches();
      }
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const toggleAlert = async (id: string, enabled: boolean) => {
    try {
      await csrfFetch(`/api/user/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAlert: enabled }),
      });
      toast.success(enabled ? t("alertEnabled") : t("alertDisabled"));
      fetchSearches();
    } catch {
      toast.error(t("updateFailed"));
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
            <Plus className="me-1 h-4 w-4" /> {t("newAlert")}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("title")}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{searches.length.toLocaleString(numberLocale)}</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("activeAlerts")}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {searches.filter((s) => s.emailAlert).length.toLocaleString(numberLocale)}
            </p>
          </div>
        </div>
      </section>

      {showForm && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">{t("createTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder={t("namePlaceholder")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder={t("queryPlaceholder")} value={form.query} onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))} />
            <Input placeholder={t("locationPlaceholder")} value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            <select
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="daily">{t("daily")}</option>
              <option value="weekly">{t("weekly")}</option>
              <option value="never">{t("never")}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={createSearch}><Plus className="me-1 h-4 w-4" /> {t("create")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
        </section>
      )}

      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : searches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => (
              <div key={s._id} className="workspace-glass-panel rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Search className="h-3 w-3" /> {s.query}
                      </span>
                      {s.filters?.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {s.filters.location}
                        </span>
                      )}
                      {s.filters?.jobType && (
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {s.filters.jobType}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {t(s.frequency)}
                      </span>
                      {s.emailAlert && (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <BellRing className="h-3 w-3" /> {t("emailAlertsOn")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAlert(s._id, !s.emailAlert)}
                      title={s.emailAlert ? t("disableAlert") : t("enableAlert")}
                    >
                      {s.emailAlert ? (
                        <BellRing className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteSearch(s._id)}>
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
