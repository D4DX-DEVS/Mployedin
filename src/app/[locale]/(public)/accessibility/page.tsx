import { Accessibility, Calendar, Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccessibilityButton } from "@/components/shared/a11y/AccessibilityButton";

const FEEDBACK_EMAIL = "support@mployedin.com";

/**
 * Accessibility statement. Structure follows the EU model statement
 * (Implementing Decision (EU) 2018/1523), the European Accessibility Act
 * Annex V information duties and the German BFSG "Erklärung zur
 * Barrierefreiheit": service description, standard, conformance status,
 * how requirements are met, known limitations, preparation method, feedback
 * and enforcement. Review at least yearly — update `lastReviewed` in both
 * message files when you do.
 */
const PROSE_SECTIONS = ["commitment", "service", "standard", "status"] as const;
const TAIL_SECTIONS = ["compatibility", "assessment"] as const;

export default async function AccessibilityStatementPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "accessibilityStatement" });
  const measures = t.raw("sections.measures.items") as string[];
  const limitations = t.raw("sections.limitations.items") as string[];

  const toc: { id: string; title: string }[] = [
    ...PROSE_SECTIONS.map((id) => ({ id, title: t(`sections.${id}.title`) })),
    { id: "measures", title: t("sections.measures.title") },
    { id: "limitations", title: t("sections.limitations.title") },
    ...TAIL_SECTIONS.map((id) => ({ id, title: t(`sections.${id}.title`) })),
    { id: "feedback", title: t("sections.feedback.title") },
    { id: "enforcement", title: t("sections.enforcement.title") },
    { id: "provider", title: t("sections.provider.title") },
  ];

  const sectionClass = "scroll-mt-24 border-t border-border/60 px-6 py-6 sm:px-8";
  const h2Class = "text-xl font-semibold text-foreground";
  const pClass = "mt-3 leading-7 text-foreground/90";

  return (
    <div className="bg-muted/30 min-h-[80vh] py-14">
      <div className="container mx-auto max-w-4xl px-4">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Accessibility className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{t("heading")}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("subheading")}</p>
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" aria-hidden />
            <span>{t("lastReviewed")}</span>
          </p>
        </header>

        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-background p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">{t("settingsTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("settingsText")}</p>
          </div>
          <AccessibilityButton className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" />
        </div>

        <article className="rounded-2xl border border-border/60 bg-background shadow-sm">
          <nav aria-labelledby="a11y-toc" className="px-6 py-5 sm:px-8">
            <h2 id="a11y-toc" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("onThisPage")}
            </h2>
            <ol className="mt-3 grid gap-1 sm:grid-cols-2">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-sm text-primary underline-offset-2 hover:underline">
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {PROSE_SECTIONS.map((id) => (
            <section key={id} id={id} aria-labelledby={`${id}-h`} className={sectionClass}>
              <h2 id={`${id}-h`} className={h2Class}>{t(`sections.${id}.title`)}</h2>
              <p className={pClass}>{t(`sections.${id}.body`)}</p>
            </section>
          ))}

          <section id="measures" aria-labelledby="measures-h" className={sectionClass}>
            <h2 id="measures-h" className={h2Class}>{t("sections.measures.title")}</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 leading-7 text-foreground/90">
              {measures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section id="limitations" aria-labelledby="limitations-h" className={sectionClass}>
            <h2 id="limitations-h" className={h2Class}>{t("sections.limitations.title")}</h2>
            <p className={pClass}>{t("sections.limitations.intro")}</p>
            <ul className="mt-3 list-disc space-y-2 ps-5 leading-7 text-foreground/90">
              {limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          {TAIL_SECTIONS.map((id) => (
            <section key={id} id={id} aria-labelledby={`${id}-h`} className={sectionClass}>
              <h2 id={`${id}-h`} className={h2Class}>{t(`sections.${id}.title`)}</h2>
              <p className={pClass}>{t(`sections.${id}.body`)}</p>
            </section>
          ))}

          <section id="feedback" aria-labelledby="feedback-h" className={sectionClass}>
            <h2 id="feedback-h" className={h2Class}>{t("sections.feedback.title")}</h2>
            <p className={pClass}>{t("sections.feedback.body", { email: FEEDBACK_EMAIL })}</p>
            <a
              href={`mailto:${FEEDBACK_EMAIL}?subject=Accessibility`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-primary hover:bg-muted"
            >
              <Mail className="h-4 w-4" aria-hidden />
              {t("sections.feedback.button")}
            </a>
          </section>

          <section id="enforcement" aria-labelledby="enforcement-h" className={sectionClass}>
            <h2 id="enforcement-h" className={h2Class}>{t("sections.enforcement.title")}</h2>
            <p className={pClass}>{t("sections.enforcement.body")}</p>
          </section>

          <section id="provider" aria-labelledby="provider-h" className={sectionClass}>
            <h2 id="provider-h" className={h2Class}>{t("sections.provider.title")}</h2>
            <address className={`${pClass} not-italic`}>{t("sections.provider.body")}</address>
          </section>
        </article>
      </div>
    </div>
  );
}
