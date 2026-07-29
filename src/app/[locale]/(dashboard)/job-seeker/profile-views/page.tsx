"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Building2, TrendingUp, Calendar, User, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";

interface ProfileViewItem {
  _id: string;
  viewerRole: string;
  source: string;
  viewedAt: string;
  viewerName?: string;
  viewerCompany?: string;
}

interface ViewStats {
  totalViews: number;
  last7Days: number;
  last30Days: number;
  bySource: { _id: string; count: number }[];
  byRole: { _id: string; count: number }[];
  recentViews: ProfileViewItem[];
}

export default function ProfileViewsPage() {
  const t = useTranslations("jobSeekerExtra.profileViews");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/job-seeker/profile-views");
      if (res.ok) setStats(await res.json());
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-3 sm:p-6">
        <div className="animate-pulse space-y-3 sm:space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !stats) {
    return (
      <div className="p-3 sm:p-6">
        <EmptyState
          icon={Eye}
          title={t("unable")}
          action={
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCcw className="me-1 h-4 w-4" /> {t("retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2 sm:text-2xl">
          <Eye className="w-5 h-5 text-primary sm:w-6 sm:h-6" />
          {t("title")}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 sm:text-sm">{t("description")}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
              <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.totalViews.toLocaleString(numberLocale)}</p>
              <p className="text-xs text-muted-foreground">{t("total")}</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-green-500/10 rounded-lg">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.last7Days.toLocaleString(numberLocale)}</p>
              <p className="text-xs text-muted-foreground">{t("last7")}</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-5 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-blue-500/10 rounded-lg">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground sm:text-2xl">{stats.last30Days.toLocaleString(numberLocale)}</p>
              <p className="text-xs text-muted-foreground">{t("last30")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Source Breakdown */}
      {stats.bySource.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-3">{t("bySource")}</h3>
          <div className="flex gap-4 flex-wrap">
            {stats.bySource.map((s) => (
              <div key={s._id} className="px-4 py-2 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground capitalize">{s._id}</span>
                <span className="ms-2 text-sm text-muted-foreground">({s.count.toLocaleString(numberLocale)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Views */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{t("recent")}</h3>
        </div>
        {stats.recentViews.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>{t("empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {stats.recentViews.map((view) => (
              <div key={view._id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {view.viewerCompany ?? view.viewerName ?? t("recruiter")}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {view.viewerRole.replace("_", " ")} • {t("via", { source: view.source })}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(view.viewedAt).toLocaleDateString(numberLocale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
