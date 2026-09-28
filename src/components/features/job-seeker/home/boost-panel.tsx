import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen, Briefcase, CheckCircle2, FileUp, Languages, Linkedin, Rocket, SlidersHorizontal, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import { BOOST_PATHS, type BoostTip } from "./profile-checks";

const ICONS: Record<BoostTip, LucideIcon> = {
  resume: FileUp,
  summary: Sparkles,
  skills: Wrench,
  experience: Briefcase,
  education: BookOpen,
  languages: Languages,
  preferences: SlidersHorizontal,
  linkedin: Linkedin,
};

interface Props {
  locale: string;
  tips: BoostTip[];
}

/** The profile gaps that hold matches back, biggest lever first; each row opens the page that fixes it. */
export function ProfileBoostPanel({ locale, tips }: Props) {
  const t = useTranslations("jobSeekerHome");
  return (
    <Panel
      id="job-seeker-boost"
      icon={Rocket}
      iconClassName={tips.length ? "bg-violet-50 text-violet-800" : "bg-emerald-50 text-emerald-800"}
      title={t("boost.title")}
      subtitle={tips.length ? t("boost.subtitle", { count: tips.length }) : t("boost.allDone")}
      action={{ href: `/${locale}/job-seeker/profile`, label: t("profileMini.improve") }}
    >
      {tips.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("boost.allDoneHint")}
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {tips.slice(0, 5).map((tip) => {
            const Icon = ICONS[tip];
            const title = tip === "linkedin" ? t("boost.linkedin") : t(`suggestions.${tip}.title`);
            return (
              <li key={tip}>
                <Link href={`/${locale}${BOOST_PATHS[tip]}`} className="group flex items-center gap-2.5 px-1 py-2 transition-colors hover:bg-muted/50">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
