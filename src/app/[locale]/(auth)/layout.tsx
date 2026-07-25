import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("authLayout");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),radial-gradient(circle_at_bottom_right,hsl(var(--accent)/0.08),transparent_28%)]">
        <div className="relative hidden w-0 flex-1 overflow-hidden border-e border-border/50 bg-[linear-gradient(160deg,hsl(var(--background)),hsl(var(--muted)/0.95))] lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.2)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.2)_1px,transparent_1px)] bg-[size:76px_76px] opacity-35" />
          <div className="absolute left-[-12%] top-[-12%] h-[360px] w-[360px] rounded-full bg-brand-blue/15 blur-[110px]" />
          <div className="absolute bottom-[-18%] right-[-10%] h-[420px] w-[420px] rounded-full bg-brand-cyan/15 blur-[130px]" />

          <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-12">
            <div className="flex items-center justify-between gap-4">
              <Link
                href={`/${locale}`}
                className="inline-flex items-center transition-transform hover:-translate-y-0.5"
              >
                <Image src="/mployedin-logo.png" alt="Mployedin" width={240} height={66} className="h-14 w-auto object-contain xl:h-16" priority />
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                {t("aiPowered")}
              </div>
            </div>

            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t("trustedWorkspace")}
              </div>
              <h1 className="max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-foreground xl:text-[3.35rem]">
                {t("heading")}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground xl:text-base xl:leading-7">
                {t("description")}
              </p>

              <div className="relative mt-6 max-w-xl">
                <div className="absolute -inset-5 rounded-[2rem] bg-primary/10 blur-2xl" />
                <div className="relative overflow-hidden rounded-[1.6rem] border border-white/70 bg-card/88 p-4 shadow-[0_30px_80px_-42px_rgba(30,47,108,0.55)] backdrop-blur dark:border-border/70 xl:p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("matchPanelEyebrow")}
                      </p>
                      <h2 className="mt-1.5 text-base font-semibold text-foreground xl:text-lg">{t("matchPanelTitle")}</h2>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {t("matchScore", { score: 92 })}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark)),hsl(var(--brand-cyan)))] text-white">
                      <BriefcaseBusiness className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{t("sampleRole")}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {t("sampleLocation")}
                      </p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ArrowUpRight className="h-4 w-4 rtl:-rotate-90" />
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-primary/[0.06] p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Users className="h-4 w-4 text-primary" />
                        {t("candidateWorkspace")}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("candidateWorkspaceDescription")}</p>
                    </div>
                    <div className="rounded-xl bg-primary/[0.06] p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <BriefcaseBusiness className="h-4 w-4 text-primary" />
                        {t("employerWorkspace")}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("employerWorkspaceDescription")}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {[t("proofOne"), t("proofTwo"), t("proofThree")].map((proof) => (
                  <div key={proof} className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    {proof}
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm text-muted-foreground/70">
              {t("copyright", { year: new Date().getFullYear() })}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-background/92 px-3 py-3 sm:px-6 sm:py-4 lg:w-[540px] lg:flex-none xl:w-[580px]">
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
          <div className="mx-auto flex w-full max-w-md flex-1 items-center">
            <div className="w-full rounded-2xl border border-border/60 bg-background/86 p-4 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.35)] backdrop-blur dark:shadow-[0_30px_80px_-42px_rgba(0,0,0,0.55)] sm:rounded-[26px] sm:p-5 md:p-6">
              <SessionWrapper disableIdleTimeout>
                {children}
              </SessionWrapper>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
