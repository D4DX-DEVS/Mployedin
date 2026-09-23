/**
 * @jest-environment jsdom
 */
import type React from "react";
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
  taskFirst: {
    recommendedNext: "الخطوة التالية المقترحة",
    nextDescription: "ركّز على الخطوة الأكثر تأثيرًا في تقدّم بحثك عن عمل.",
    atAGlance: "نظرة سريعة",
    openAction: "فتح",
    highImpact: "تأثير مرتفع",
  },
  defaults: {
    jobSeekerName: "باحث عن عمل",
  },
  greeting: {
    hello: "مرحبًا، {name}",
    morning: "صباح الخير، {name}",
    afternoon: "مساء الخير، {name}",
    evening: "مساء الخير، {name}",
    subtitle: "لنجد فرصتك التالية.",
    editPreferences: "تعديل التفضيلات",
  },
  search: {
    placeholder: "ابحث عن وظائف",
    submit: "بحث عن وظائف",
    label: "البحث عن وظائف",
  },
  profileMini: {
    title: "ملفك الشخصي",
    improve: "تحسين الملف",
    detailLeft: "أضف تفاصيل أخرى",
  },
  recentApplications: {
    title: "التقديمات الأخيرة",
    viewAll: "عرض كل الطلبات",
  },
  summary: {
    activeMatches: "0 تطابقات نشطة",
    applications: "طلبات التقديم",
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
    noMatchesTitle: "لا توجد وظائف مطابقة حالياً",
    noMatchesBody: "أنت على اطلاع بكل جديد! لا توجد حالياً وظائف جديدة غير مُقدّم عليها تتطابق مع تفضيلاتك.",
    noMatchesCta: "تعديل التفضيلات",
    browseJobsCta: "تصفح جميع الوظائف",
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
    eyebrow: "النشاط",
    title: "نظرة سريعة على بحثك عن وظيفة",
    applications: "الطلبات",
    interviews: "المقابلات",
    profileViews: "مشاهدات الملف",
    managePreferences: "إدارة تفضيلات الوظائف",
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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/ar/job-seeker",
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

  it("opens on the search, not on a status dashboard", async () => {
    render(
      <JobSeekerHomePage locale="ar" initialData={initialData} userName="Muhammed Ilyas MK" />
    );

    // What the seeker came to do.
    expect(await screen.findByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بحث عن وظائف" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "وظائف موصى بها" })).toBeInTheDocument();

    // The panels that made this page a dashboard about the seeker.
    expect(screen.queryByText("نظرة سريعة")).not.toBeInTheDocument();
    expect(screen.queryByText("رؤى الذكاء الاصطناعي اليومية")).not.toBeInTheDocument();
    expect(screen.queryByText("إجراءات ذات أولوية")).not.toBeInTheDocument();
    expect(screen.queryByText("أهم المهارات في ملفك")).not.toBeInTheDocument();

    // The daily-insight request went with the panel that displayed it.
    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalledWith("/api/ai/daily-insights?locale=ar");
    });
  });

  it("shows a next step only when something is actually waiting", async () => {
    const { unmount } = render(
      <JobSeekerHomePage locale="ar" initialData={initialData} userName="Muhammed Ilyas MK" />
    );
    // initialData has no offers, interviews or unread messages.
    expect(screen.queryByText("الخطوة التالية المقترحة")).not.toBeInTheDocument();
    unmount();

    render(
      <JobSeekerHomePage
        locale="ar"
        userName="Muhammed Ilyas MK"
        initialData={{
          ...initialData,
          stats: { ...initialData.stats, upcomingInterviews: { count: 2 } },
        }}
      />
    );
    expect(await screen.findByText("الخطوة التالية المقترحة")).toBeInTheDocument();
  });
  // "Recommended jobs" lists only what the engine recommends. When that is
  // nothing — or fewer than four — the page says so and says why, instead of
  // filling the slots with weaker jobs the digest would never send.
  const job = (id: string) => ({
    _id: id,
    title: `Job ${id}`,
    createdAt: new Date("2026-09-20").toISOString(),
    matchScore: 88,
    skills: [],
    matchedSkills: [],
  });
  const withRecommendation = (
    jobs: ReturnType<typeof job>[],
    limitingFactor: string | null,
    bestScore = 64,
  ): InitialHomeData => ({
    ...initialData,
    jobs,
    recommendation: {
      threshold: 80,
      bestScore,
      recommendedCount: jobs.length,
      limitingFactor: limitingFactor as never,
    },
  });

  it("explains an empty list and sends a profile gap to the profile", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "no_skills")} />);
    expect(await screen.findByText("recommendedJobs.strongOnlyTitle")).toBeInTheDocument();
    expect(screen.getByText("recommendedJobs.strongOnlyBody")).toBeInTheDocument();
    expect(screen.getByText("recommendedJobs.blockers.no_skills")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "recommendedJobs.improveProfileCta" })).toHaveAttribute(
      "href",
      "/ar/job-seeker/profile",
    );
  });

  it("sends a preference gate to the preferences page", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "country")} />);
    expect(await screen.findByText("recommendedJobs.blockers.country")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "recommendedJobs.updatePreferencesCta" })).toHaveAttribute(
      "href",
      "/ar/job-seeker/preferences",
    );
  });

  it("does not quote a closest match when nothing was eligible", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([], "country", 0)} />);
    expect(await screen.findByText("recommendedJobs.strongOnlyBodyNone")).toBeInTheDocument();
    expect(screen.queryByText("recommendedJobs.strongOnlyBody")).not.toBeInTheDocument();
  });

  it("says there are no other strong matches when it has fewer than four", async () => {
    render(<JobSeekerHomePage locale="ar" initialData={withRecommendation([job("a"), job("b")], null)} />);
    expect(await screen.findByText("recommendedJobs.noOtherStrong")).toBeInTheDocument();
    expect(screen.queryByText("recommendedJobs.strongOnlyTitle")).not.toBeInTheDocument();
  });

  it("adds no note when all four slots hold strong matches", async () => {
    render(
      <JobSeekerHomePage
        locale="ar"
        initialData={withRecommendation([job("a"), job("b"), job("c"), job("d")], null)}
      />,
    );
    await screen.findAllByRole("link", { name: /jobCard.viewJob|viewJob/ });
    expect(screen.queryByText("recommendedJobs.noOtherStrong")).not.toBeInTheDocument();
  });
});
