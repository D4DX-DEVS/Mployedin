import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BriefcaseBusiness,
  Calendar,
  ChevronRight,
  FileText,
  Gift,
  Target,
  type LucideIcon,
} from "lucide-react";
import { DashboardSection } from "@/components/shared/DashboardOverview";

interface AgentPipelineProps {
  leads: number;
  leadsConverted: number;
  applications: number;
  interviews: number;
  interviewRate: number;
  offers: number;
  offerRate: number;
  placements: number;
  locale: string;
}

interface Stage {
  key: "leads" | "applied" | "interviews" | "offers" | "hired";
  value: number;
  detail: string;
  icon: LucideIcon;
  href: string;
  accent: string;
}

/**
 * The agent's funnel, lead to placement: five stages top to bottom, each a link
 * into the live list it counts.
 *
 * Laid out as rows rather than as employer's five-across `InteractivePipeline`
 * strip, because of where it sits. Employer renders that strip full width,
 * where five cells have room; here it shares a row with Role performance, and a
 * one-line strip beside a three-row table left the two cards 168px and 267px
 * tall — a permanent 99px of ragged white under the shorter one, since both
 * heights are fixed (the role list is capped at three). Padding the cells to
 * match would only move that void inside the card, which is why the row carried
 * `items-start` and the raggedness with it.
 *
 * Rows fix it at the source: the card is now the same shape as the card beside
 * it — header plus list rows, which is the pairing employer's own two-up row
 * documents as the reason its cards sit level. Reading top to bottom also suits
 * a funnel better than left to right.
 *
 * The detail under each stage is a fact the queue panel above does not already
 * print — leads won, the two conversion rates — so no number appears twice on
 * the page.
 */
export function AgentPipeline({
  leads,
  leadsConverted,
  applications,
  interviews,
  interviewRate,
  offers,
  offerRate,
  placements,
  locale,
}: AgentPipelineProps) {
  const t = useTranslations("agentDashboard.pipeline");

  const stages: Stage[] = [
    {
      key: "leads",
      value: leads,
      detail: t("won", { count: leadsConverted }),
      icon: Target,
      href: `/${locale}/agent/leads`,
      accent: "text-sky-600",
    },
    {
      key: "applied",
      value: applications,
      detail: t("acrossRoles"),
      icon: FileText,
      href: `/${locale}/agent/candidates`,
      accent: "text-violet-600",
    },
    {
      key: "interviews",
      value: interviews,
      detail: t("ofApplicants", { rate: interviewRate }),
      icon: Calendar,
      href: `/${locale}/agent/interviews`,
      accent: "text-amber-600",
    },
    {
      key: "offers",
      value: offers,
      detail: t("ofApplicants", { rate: offerRate }),
      icon: Gift,
      href: `/${locale}/agent/offers`,
      accent: "text-emerald-600",
    },
    {
      key: "hired",
      value: placements,
      detail: t("placed"),
      icon: BriefcaseBusiness,
      href: `/${locale}/agent/placements`,
      accent: "text-teal-600",
    },
  ];

  return (
    <DashboardSection
      headingId="agent-placement-pipeline"
      title={t("title")}
      description={t("description")}
      action={
        <Link
          href={`/${locale}/agent/candidates`}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm"
        >
          {t("viewAll")}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      }
    >
      <nav aria-label={t("title")}>
        <ul className="divide-y divide-border/60">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <li key={stage.key}>
                <Link
                  href={stage.href}
                  aria-label={t("stageAriaLabel", { stage: t(stage.key), value: stage.value, detail: stage.detail })}
                  /* `min-h-11` keeps the 44px touch target on phones; from `md`
                     the row tightens so five of them measure the same as the
                     three-row table alongside. */
                  className="group relative flex min-h-11 items-center gap-3 px-4 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-5 md:min-h-9 md:py-1"
                >
                  <span
                    className={`absolute inset-y-0 start-0 w-0.5 bg-current opacity-70 ${stage.accent}`}
                    aria-hidden="true"
                  />
                  <Icon className={`h-4 w-4 shrink-0 ${stage.accent}`} aria-hidden="true" />
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${stage.accent}`}>
                    {t(stage.key)}
                  </span>
                  {/* Hidden on phones, where the row has no width to spare and
                      the number is the thing being scanned. */}
                  <span className="hidden min-w-0 truncate text-xs font-medium text-muted-foreground sm:inline">
                    {stage.detail}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{stage.value}</span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </DashboardSection>
  );
}
