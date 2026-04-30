/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { JobSeekerHomePage, type InitialHomeData } from "@/components/features/job-seeker/home/JobSeekerHomePage";

function getByPath(obj: Record<string, unknown>, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[segment];
    }

    return undefined;
  }, obj);

  return typeof value === "string" ? value : undefined;
}

const translations: Record<string, unknown> = {
  defaults: {
    jobSeekerName: "باحث عن عمل",
  },
  hero: {
    addPreferredLocations: "أضف المواقع المفضلة",
    setSalaryRange: "حدد نطاق الراتب",
    browseMatchingJobs: "تصفح الوظائف المطابقة",
    refine: "تحسين",
    aiSuggestions: "اقتراحات الذكاء الاصطناعي",
  },
  summary: {
    activeMatches: "0 تطابقات نشطة",
    applications: "طلبات التقديم",
    savedJobs: "وظائف محفوظة",
    interviews: "مقابلات",
    profileViews: "مشاهدات الملف",
    nextStepsQueued: "5 خطوات تالية بانتظارك",
  },
  recommendedJobs: {
    eyebrow: "وظائف موصى بها",
    title: "أفضل الأدوار المطابقة بناءً على إشارات ملفك الحالية",
    viewAll: "عرض كل الوظائف",
    emptyTitle: "لا توجد توصيات بعد",
    emptyBody: "أكمل ملفك وتفضيلاتك للحصول على اقتراحات وظائف أقوى.",
    emptyCta: "حدد التفضيلات",
  },
  priorityActions: {
    eyebrow: "إجراءات ذات أولوية",
    title: "حسّن توافق ملفك مع الوظائف خلال الدقائق القادمة",
    description: "تحديثات واضحة ومرتبة تساعدك على تحسين الظهور وجودة التطابق بدون تحويل الصفحة إلى قائمة مهام مزدحمة.",
    openAiSuggestions: "فتح اقتراحات الذكاء الاصطناعي",
    highImpact: "تأثير عالٍ",
  },
  profileCard: {
    summaryFallback: "أكمل ملفك للحصول على تطابقات أقوى واهتمام أكبر من مسؤولي التوظيف.",
    profileCompleteness: "اكتمال الملف الشخصي",
    profileCompletenessAria: "اكتمال الملف الشخصي: 42 بالمئة",
    topSkills: "أهم المهارات في ملفك",
    updateProfile: "تحديث الملف الشخصي",
    updatePreferences: "تحديث التفضيلات",
  },
  quickAccess: {
    eyebrow: "وصول سريع",
    title: "ابق قريباً من مسار طلباتك",
    applications: "الطلبات",
    interviews: "المقابلات",
    preferences: "التفضيلات",
    edit: "تعديل",
  },
  insights: {
    title: "رؤى الذكاء الاصطناعي اليومية",
    description: "ملاحظات قصيرة وعالية القيمة بناءً على جودة ملفك ونشاط سوق العمل.",
    refresh: "تحديث الرؤى",
    empty: "أكمل ملفك لفتح رؤى الذكاء الاصطناعي.",
  },
  suggestions: {
    resume: {
      title: "ارفع سيرتك الذاتية",
      body: "يقوم مسؤولو التوظيف بترشيح الملفات الكاملة بشكل أسرع. أضف سيرتك الذاتية حتى نتمكن من تحسين مطابقة الوظائف.",
      cta: "رفع السيرة الذاتية",
    },
    summary: {
      title: "أضف ملخصاً احترافياً",
      body: "يساعد الملخص القوي مسؤولي التوظيف على فهم قيمتك بسرعة. أخبر الذكاء الاصطناعي عنك وسيكتب واحداً لك.",
      cta: "اكتب يدوياً",
      placeholder: "مثال: أنا مطور React لدي 3 سنوات من الخبرة في بناء تطبيقات التجارة الإلكترونية...",
    },
    preferences: {
      title: "حسّن تفضيلاتك الوظيفية",
      body: "أضف تفضيلات الدور والموقع حتى تصبح التوصيات أقرب لما تريده.",
      cta: "حدد التفضيلات",
    },
    skills: {
      title: "أضف بعض المهارات الإضافية",
      body: "المهارات من أقوى إشارات الترتيب. أخبر الذكاء الاصطناعي بمهاراتك وسيضيفها إلى ملفك.",
      cta: "حدّث يدوياً",
      placeholder: "مثال: React، Node.js، TypeScript، MongoDB، AWS، Docker...",
    },
    experience: {
      title: "أكمل خبراتك العملية",
      body: "تساعدنا الخبرة على إظهار أدوار أفضل لك. صف وظائفك السابقة وسيقوم الذكاء الاصطناعي بتنظيمها.",
      cta: "أضف يدوياً",
      placeholder: "مثال: عملت في Google كمهندس برمجيات من 2022 إلى 2024 وكنت أبني واجهات برمجة بحث...",
    },
    education: {
      title: "أضف تعليمك",
      body: "يعزز التعليم درجة ملفك. أخبر الذكاء الاصطناعي عن شهاداتك وسيقوم بتنسيقها.",
      cta: "أضف يدوياً",
      placeholder: "مثال: بكالوريوس تقنية معلومات من جامعة XYZ، تخرجت في 2022...",
    },
    languages: {
      title: "أضف لغاتك",
      body: "المهارات اللغوية مهمة في سوق الخليج. أخبر الذكاء الاصطناعي بلغاتك ومستويات إتقانك.",
      cta: "أضف يدوياً",
      placeholder: "مثال: الإنجليزية بطلاقة، العربية متوسطة، الهندية لغة أم...",
    },
  },
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslations: () => (key: string) => getByPath(translations, key) ?? key,
}));

describe("JobSeekerHomePage", () => {
  const initialData: InitialHomeData = {
    profile: {
      preferredRoles: ["Frontend Developer"],
      preferredCountries: [],
      skills: [],
      experience: [],
      education: [],
      languages: [],
      profileCompleteness: 42,
    },
    stats: {
      applicationsSent: { count: 3 },
      upcomingInterviews: { count: 0 },
      savedJobs: { count: 1 },
      recruiterViews: { total: 0 },
    },
    jobs: [],
    appliedJobs: [],
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ insights: [] }),
    }) as unknown as typeof fetch;
  });

  it("renders Arabic home labels and suggestions when locale is ar", async () => {
    const { container } = render(
      <JobSeekerHomePage locale="ar" initialData={initialData} userName="Muhammed Ilyas MK" />
    );

    expect(await screen.findByText("تصفح الوظائف المطابقة")).toBeInTheDocument();
    expect(screen.getByText("اقتراحات الذكاء الاصطناعي")).toBeInTheDocument();
    expect(screen.getByText("ارفع سيرتك الذاتية")).toBeInTheDocument();
    expect(screen.getByText("ابق قريباً من مسار طلباتك")).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai/daily-insights");
    });
  });
});