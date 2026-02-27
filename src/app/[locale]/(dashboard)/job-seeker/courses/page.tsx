"use client";

import { PageHeader } from "@/components/shared/PageHeader";

const FEATURED_COURSES = [
  {
    id: "1",
    title: "English for Business Communication",
    provider: "Coursera",
    duration: "4 weeks",
    level: "Beginner",
    category: "Language",
    url: "https://www.coursera.org/learn/business-english",
    free: true,
  },
  {
    id: "2",
    title: "Project Management Fundamentals",
    provider: "Alison",
    duration: "6 hours",
    level: "Beginner",
    category: "Management",
    url: "https://alison.com/course/introduction-to-project-management",
    free: true,
  },
  {
    id: "3",
    title: "Data Analysis with Excel",
    provider: "Microsoft Learn",
    duration: "8 hours",
    level: "Intermediate",
    category: "Technology",
    url: "https://learn.microsoft.com/en-us/training/paths/excel-data-analysis/",
    free: true,
  },
  {
    id: "4",
    title: "Customer Service Excellence",
    provider: "Alison",
    duration: "3 hours",
    level: "Beginner",
    category: "Customer Service",
    url: "https://alison.com/course/customer-service-skills",
    free: true,
  },
  {
    id: "5",
    title: "Digital Marketing Fundamentals",
    provider: "Google",
    duration: "40 hours",
    level: "Beginner",
    category: "Marketing",
    url: "https://skillshop.google.com/",
    free: true,
  },
  {
    id: "6",
    title: "Construction Safety (OSHA 10)",
    provider: "OSHA Education Center",
    duration: "10 hours",
    level: "Beginner",
    category: "Safety",
    url: "https://www.oshaedcenter.com/",
    free: false,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Language: "bg-blue-100 text-blue-700",
  Management: "bg-purple-100 text-purple-700",
  Technology: "bg-cyan-100 text-cyan-700",
  "Customer Service": "bg-green-100 text-green-700",
  Marketing: "bg-amber-100 text-amber-700",
  Safety: "bg-red-100 text-red-700",
};

export default function JobSeekerCoursesPage() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Courses & Training"
        description="Boost your skills with curated courses to improve your employability"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURED_COURSES.map((course) => (
          <div
            key={course.id}
            className="bg-card rounded-xl border shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  CATEGORY_COLORS[course.category] ?? "bg-muted/50 text-muted-foreground"
                }`}
              >
                {course.category}
              </span>
              {course.free && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  Free
                </span>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-foreground leading-snug">{course.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{course.provider}</p>
            </div>

            <div className="flex gap-4 text-xs text-muted-foreground/60">
              <span>⏱ {course.duration}</span>
              <span>📊 {course.level}</span>
            </div>

            <a
              href={course.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-block text-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Start Course →
            </a>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-800">Want personalised recommendations?</h3>
        <p className="text-sm text-blue-600 mt-1">
          Complete your profile and skills section, and our AI will suggest courses tailored to your career goals.
        </p>
      </div>
    </div>
  );
}
