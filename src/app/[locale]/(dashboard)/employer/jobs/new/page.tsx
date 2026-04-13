import Link from "next/link";
import { Bot, FilePenLine, Mic, ArrowRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { JobFormWizard } from "@/components/features/employer/job-form/JobFormWizard";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string; prefill?: string }>;
}

export default async function NewJobPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { mode, prefill } = await searchParams;

  if (mode === "manual") {
    return <JobFormWizard locale={locale} useAiPrefill={prefill === "ai"} />;
  }

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Create a Job Posting"
        description="Start with AI for a guided draft, or open the manual form directly."
      />

      <div className="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
        <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-7 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.45)]">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
            <Sparkles className="h-4 w-4" />
            Faster setup
          </div>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-slate-950">
            Let AI ask the basics, then review everything in the real job form before you publish.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            The AI flow collects role, location, skills, salary, and openings with typing or voice. Nothing is posted automatically. It only prepares a draft in the manual form for review.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <Bot className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Guided questions</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">AI asks only for the core hiring details first.</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <Mic className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Voice or typing</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">Recruiters can speak requirements instead of filling every field manually.</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <FilePenLine className="h-5 w-5 text-sky-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Review before save</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">AI prefills the form, then the recruiter checks and submits it.</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/employer/jobs/ai-create`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Start AI Job Posting
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/${locale}/employer/jobs/new?mode=manual`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Open Manual Form
            </Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Manual posting</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            Best when you already know the exact role details.
          </h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">Use manual mode if you need:</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>Full control over every section from the first screen</li>
                <li>Salary hidden or shown based on employer preference</li>
                <li>Optional openings and applicant caps</li>
              </ul>
            </div>

            <Link
              href={`/${locale}/employer/jobs/new?mode=manual`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Continue with manual posting</p>
                <p className="mt-1 text-xs text-slate-500">Open the full wizard now.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-500" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
