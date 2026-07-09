import Link from "next/link";
import { Bot, FilePenLine, Mic, ArrowLeft, ArrowRight, Sparkles, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; prefill?: string }>;
}

export default async function NewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { mode, prefill } = await searchParams;
  const t = await getTranslations("employerJobNew");
  const ForwardIcon = locale === "ar" ? ArrowLeft : ArrowRight;

  if (mode === "manual") {
    return <JobFormWizard locale={locale} useAiPrefill={prefill === "ai"} />;
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
        <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-7 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.45)]">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
            <Sparkles className="h-4 w-4" />
            {t("fasterSetup")}
          </div>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-slate-950">
            {t("aiHeading")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {t("aiDescription")}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <Bot className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">{t("guidedQuestions")}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("guidedQuestionsDesc")}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <Mic className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">{t("voiceOrTyping")}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("voiceOrTypingDesc")}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <FilePenLine className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">{t("reviewBeforeSave")}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("reviewBeforeSaveDesc")}</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/employer/jobs/ai-create`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {t("startAiPosting")}
              <ForwardIcon className="h-4 w-4" />
            </Link>
            <Link
              href={`/${locale}/employer/jobs/ai-extract`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              <Upload className="h-4 w-4" />
              {t("uploadJobPoster")}
            </Link>
            <Link
              href={`/${locale}/employer/jobs/new?mode=manual`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {t("openManualForm")}
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("manualPosting")}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {t("manualHeading")}
          </h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">{t("manualModeNeeds")}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>{t("manualBullet1")}</li>
                <li>{t("manualBullet2")}</li>
                <li>{t("manualBullet3")}</li>
              </ul>
            </div>

            <Link
              href={`/${locale}/employer/jobs/new?mode=manual`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-start transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{t("continueManual")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("continueManualDesc")}</p>
              </div>
              <ForwardIcon className="h-4 w-4 text-slate-500" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
