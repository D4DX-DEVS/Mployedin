import { useTranslations } from "next-intl";

/** Shape of a match, not a claim about a real one: the card is labelled as an illustration. */
const EXAMPLE_BARS = [
  { key: "explainerSkills", value: 95 },
  { key: "explainerExperience", value: 88 },
  { key: "explainerLocation", value: 100 },
  { key: "explainerSalary", value: 78 },
] as const;

export function AiExplainerSection() {
  const t = useTranslations("landing");

  return (
    <section id="ai" className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("explainerEyebrow")}</p>
          <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">{t("explainerTitle")}</h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">{t("explainerDescription")}</p>
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-3.5 lg:max-w-xl rounded-3xl border border-border/70 bg-[hsl(var(--brand-blue-pale))] p-5 sm:p-6">
          <span className="self-start rounded-full bg-card px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {t("explainerExample")}
          </span>
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground">
              {t("explainerRole").split(" ").map((word) => word.charAt(0)).join("").slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold text-foreground">{t("explainerRole")}</div>
              <div className="text-sm text-muted-foreground">{t("explainerCompany")}</div>
            </div>
            <span className="text-2xl font-extrabold text-emerald-700">92%</span>
          </div>
          {EXAMPLE_BARS.map((bar) => (
            <div key={bar.key} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>{t(bar.key)}</span>
                <span>{bar.value}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-primary/15" role="presentation">
                <div className="h-full rounded-full bg-primary" style={{ width: `${bar.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
