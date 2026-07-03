"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, BarChart3, Clock, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

const FEATURED_COURSES = [
  {
    id: "1",
    titleKey: "businessEnglish",
    provider: "Coursera",
    durationKey: "fourWeeks",
    levelKey: "beginner",
    categoryKey: "language",
    url: "https://www.coursera.org/learn/business-english",
    free: true,
  },
  {
    id: "2",
    titleKey: "projectManagement",
    provider: "Alison",
    durationKey: "sixHours",
    levelKey: "beginner",
    categoryKey: "management",
    url: "https://alison.com/course/introduction-to-project-management",
    free: true,
  },
  {
    id: "3",
    titleKey: "excelAnalysis",
    provider: "Microsoft Learn",
    durationKey: "eightHours",
    levelKey: "intermediate",
    categoryKey: "technology",
    url: "https://learn.microsoft.com/en-us/training/paths/excel-data-analysis/",
    free: true,
  },
  {
    id: "4",
    titleKey: "customerService",
    provider: "Alison",
    durationKey: "threeHours",
    levelKey: "beginner",
    categoryKey: "customerService",
    url: "https://alison.com/course/customer-service-skills",
    free: true,
  },
  {
    id: "5",
    titleKey: "digitalMarketing",
    provider: "Google",
    durationKey: "fortyHours",
    levelKey: "beginner",
    categoryKey: "marketing",
    url: "https://skillshop.google.com/",
    free: true,
  },
  {
    id: "6",
    titleKey: "constructionSafety",
    provider: "OSHA Education Center",
    durationKey: "tenHours",
    levelKey: "beginner",
    categoryKey: "safety",
    url: "https://www.oshaedcenter.com/",
    free: false,
  },
];

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

export default function JobSeekerCoursesPage() {
  const t = useTranslations("jobSeekerCourses");
  const [courses, setCourses] = useState(FEATURED_COURSES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch("/api/courses?limit=50");
        if (res.ok) {
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
          }
        }
      } catch {
        // Silently fallback to static courses
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, []);

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

      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
          <div
            key={course.id}
            className="bg-card rounded-xl border shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
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
              <h3 className="font-semibold text-foreground leading-snug">{t(`courses.${course.titleKey}`)}</h3>
              <p className="text-sm text-muted-foreground mt-1">{course.provider}</p>
            </div>

            <div className="flex gap-4 text-xs text-muted-foreground/60">
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

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-800">{t("recommendationsTitle")}</h3>
            <p className="text-sm text-blue-600 mt-1">
              {t("recommendationsDescription")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
