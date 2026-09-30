import Image from "next/image";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { pickMessages } from "@/lib/i18n/clientMessages";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import { CookieConsentMount } from "@/components/shared/CookieConsentMount";
import { AccessibilityPanel } from "@/components/shared/AccessibilityPanel";
import { isLegalPagePublished } from "@/lib/cms/legalPageStatus";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("authLayout");
  const statementPublished = await isLegalPagePublished("accessibility-statement");
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, "auth")}>
      <div className="flex min-h-screen bg-background">
        <AccessibilityPanel locale={locale} statementPublished={statementPublished} />
        <div className="relative flex w-full flex-col bg-background px-5 py-5 sm:px-8 sm:py-7 lg:w-[42%] lg:min-w-[430px] lg:px-10 xl:w-[40%] xl:px-14">
          {/* In flow, not absolute: a form taller than the viewport (register)
              started at the top and slid under the logo. */}
          {/* header/aside/main give every part of the page a landmark. */}
          <header className="relative z-20 shrink-0 self-start">
            <Link href={`/${locale}`} className="inline-flex items-center" aria-label="Mployedin">
              <Image src="/logo.png" alt="Mployedin" width={106} height={37} className="h-auto w-[106px] object-contain" priority />
            </Link>
          </header>
          <main id={MAIN_CONTENT_ID} className="flex flex-1 flex-col justify-center">
            <div className="mx-auto flex w-full max-w-md flex-1 items-center">
              <div className="w-full py-4 sm:py-8">
                <SessionWrapper disableIdleTimeout>
                  <CsrfProvider>
                    {children}
                    <CookieConsentMount locale={locale} />
                  </CsrfProvider>
                </SessionWrapper>
              </div>
            </div>
          </main>
        </div>

        <aside className="relative hidden flex-1 overflow-hidden border-s border-border/50 bg-[linear-gradient(160deg,hsl(var(--background)),hsl(var(--muted)/0.95))] lg:flex">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.2)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.2)_1px,transparent_1px)] bg-[size:76px_76px] opacity-35" />
          <div className="absolute left-[-12%] top-[-12%] h-[360px] w-[360px] rounded-full bg-brand-blue/15 blur-[110px]" />
          <div className="absolute bottom-[-18%] right-[-10%] h-[420px] w-[420px] rounded-full bg-brand-cyan/15 blur-[130px]" />

          <Image
            src="/login-bg.png"
            alt=""
            width={700}
            height={467}
            aria-hidden
            priority
            className="pointer-events-none absolute right-[-2%] top-[12%] hidden w-[56%] max-w-[640px] select-none object-contain opacity-55 xl:block"
          />

          <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-center px-8 py-12 xl:px-16">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {t("aiPowered")}
            </div>

            <div className="w-full max-w-[560px]">
              <div className="relative">
                <div className="absolute -inset-6 rounded-[2.25rem] bg-primary/10 blur-3xl" />
                <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-card/80 p-4 shadow-[0_32px_100px_-45px_rgba(30,47,108,0.7)] backdrop-blur-xl sm:p-5">
                  <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-4">
                    <div>
                      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("intelligenceEyebrow")}
                      </p>
                      <h2 className="mt-1.5 text-base font-semibold text-foreground xl:text-lg">{t("intelligenceTitle")}</h2>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t("liveSignal")}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-primary/10 bg-primary/[0.06] p-3">
                      <p className="text-lg font-semibold tracking-tight text-foreground">92%</p>
                      <p className="mt-1 text-[10px] font-medium leading-4 text-muted-foreground">{t("signalMatch")}</p>
                    </div>
                    <div className="rounded-xl border border-primary/10 bg-primary/[0.06] p-3">
                      <p className="text-lg font-semibold tracking-tight text-foreground">24/7</p>
                      <p className="mt-1 text-[10px] font-medium leading-4 text-muted-foreground">{t("signalNetwork")}</p>
                    </div>
                    <div className="rounded-xl border border-primary/10 bg-primary/[0.06] p-3">
                      <p className="text-lg font-semibold tracking-tight text-foreground">1</p>
                      <p className="mt-1 text-[10px] font-medium leading-4 text-muted-foreground">{t("signalWorkspace")}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border/70 bg-background/75 p-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark)),hsl(var(--brand-cyan)))] text-white shadow-lg shadow-primary/20">
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

                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary/10 bg-primary/[0.045] px-3 py-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{t("insightTitle")}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("insightDescription")}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 max-w-2xl text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t("trustedWorkspace")}
              </div>
              <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] text-foreground xl:text-[35px]">{t("heading")}</h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground xl:text-base xl:leading-7">{t("description")}</p>
            </div>

            <div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2">
              {[t("proofOne"), t("proofTwo"), t("proofThree")].map((proof) => (
                <div key={proof} className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  {proof}
                </div>
              ))}
            </div>
          </div>

          <p className="absolute bottom-6 inset-x-0 text-center text-sm text-muted-foreground/70">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </aside>
      </div>
    </NextIntlClientProvider>
  );
}
