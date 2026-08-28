"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Bell, Plus, Trash2, Search, Inbox,
  BellRing, Briefcase, MapPin, Clock, TrendingUp,
} from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
  const expLabel = (lvl?: string) =>
    lvl === "entry" ? t("experienceEntry")
      : lvl === "mid" ? t("experienceMid")
        : lvl === "senior" ? t("experienceSenior")
          : "";
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "", query: "", location: "", jobType: "", experienceLevel: "",
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
            experienceLevel: (form.experienceLevel && form.experienceLevel !== "all") ? form.experienceLevel : undefined,
          },
          frequency: form.frequency,
          emailAlert: form.frequency !== "never",
        }),
      });
      if (res.ok) {
        toast.success(t("created"));
        setForm({ name: "", query: "", location: "", jobType: "", experienceLevel: "", frequency: "weekly" });
        setShowForm(false);
        fetchSearches();
      } else if (res.status === 409) {
        toast.info(t("duplicate"));
      } else {
        toast.error(t("createFailed"));
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
      <DashboardPageHeader
        icon={Bell}
        eyebrow={t("title")}
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="me-1 h-4 w-4" /> {t("newAlert")}
          </Button>
        }
        metrics={[
          { label: t("title"), value: searches.length.toLocaleString(numberLocale), icon: Search },
          { label: t("activeAlerts"), value: searches.filter((s) => s.emailAlert).length.toLocaleString(numberLocale), icon: BellRing },
        ]}
      />

      {showForm && (
        <section className="workspace-panel-surface rounded-3xl space-y-4 panel-body">
          <h2 className="heading-section font-semibold text-foreground">{t("createTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder={t("namePlaceholder")} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder={t("queryPlaceholder")} value={form.query} onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))} />
            <Input placeholder={t("locationPlaceholder")} value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            <Select value={form.experienceLevel} onValueChange={(val) => setForm((p) => ({ ...p, experienceLevel: val }))}>
              <SelectTrigger><SelectValue placeholder={t("experienceAny")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("experienceAny")}</SelectItem>
                <SelectItem value="entry">{t("experienceEntry")}</SelectItem>
                <SelectItem value="mid">{t("experienceMid")}</SelectItem>
                <SelectItem value="senior">{t("experienceSenior")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.frequency} onValueChange={(val) => setForm((p) => ({ ...p, frequency: val }))}>
              <SelectTrigger><SelectValue placeholder={t("selectFrequency")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t("daily")}</SelectItem>
                <SelectItem value="weekly">{t("weekly")}</SelectItem>
                <SelectItem value="never">{t("never")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={createSearch}><Plus className="me-1 h-4 w-4" /> {t("create")}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
          </div>
        </section>
      )}

      <section className="workspace-panel-surface rounded-3xl panel-body">
        {searches.length > 0 && (
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder={t("searchPlaceholder") ?? "Search saved searches..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary chip-pad"
            />
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="workspace-glass-panel card-pad rounded-2xl space-y-3">
                <Skeleton className="h-4 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
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
            {searches.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((s) => (
              <div key={s._id} className="workspace-glass-panel card-pad rounded-2xl">
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
                      {s.filters?.experienceLevel && (
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> {expLabel(s.filters.experienceLevel)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
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
