"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, BarChart3, Clock, Loader2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";

const CATEGORY_COLORS: Record<string, string> = {
  language: "bg-blue-100 text-blue-700",
  management: "bg-purple-100 text-purple-700",
  technology: "bg-cyan-100 text-cyan-700",
  customerService: "bg-green-100 text-green-700",
  marketing: "bg-amber-100 text-amber-700",
  safety: "bg-red-100 text-red-700",
};

interface ApiCourse {
  _id: string;
  title: string;
  provider: string;
  url: string;
  description?: string;
  duration?: string;
  level?: string;
  category?: string;
  free?: boolean;
  featured?: boolean;
}

interface Course {
  id: string;
  titleKey: string;
  provider: string;
  durationKey: string;
  levelKey: string;
  categoryKey: string;
  url: string;
  free: boolean;
}

export default function JobSeekerCoursesPage() {
  const t = useTranslations("jobSeekerCourses");
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/api/courses?limit=50");
        if (!res.ok) {
          setError(t("loadFailed"));
          setCourses([]);
          return;
        }
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const apiCourses = (data.items as ApiCourse[]).map((c) => ({
            id: c._id,
            titleKey: c.title,
            provider: c.provider,
            durationKey: c.duration ?? "unknown",
            levelKey: c.level ?? "beginner",
            categoryKey: c.category ?? "technology",
            url: c.url,
            free: c.free !== false,
          }));
          setCourses(apiCourses);
        } else {
          setCourses([]);
        }
      } catch (err) {
        setError(t("loadFailed"));
        setCourses([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [t]);

  return (
    <div className="page-container">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">{t("loadFailed")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("loadFailedBody")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
                {t("retry")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && courses && courses.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
          <h3 className="font-semibold text-foreground">{t("empty")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("emptyBody")}</p>
        </div>
      )}

      {!loading && !error && courses && courses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-card rounded-xl border shadow-sm flex flex-col gap-2 sm:gap-3 hover:shadow-md transition-shadow panel-body"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    CATEGORY_COLORS[course.categoryKey] ?? "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {t(`category.${course.categoryKey}`)}
                </span>
                {course.free && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    {t("free")}
                  </span>
                )}
              </div>

              <div>
                <h3 className="heading-subsection font-semibold text-foreground leading-snug">{t(`courses.${course.titleKey}`)}</h3>
                <p className="text-xs text-muted-foreground mt-1 sm:text-sm">{course.provider}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4 text-xs text-muted-foreground/60">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t(`duration.${course.durationKey}`)}</span>
                <span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" /> {t(`level.${course.levelKey}`)}</span>
              </div>

              <a
                href={course.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                {t("startCourse")} <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
