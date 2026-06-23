import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const LEGACY_TONE_CLASS_MAP: Record<string, string> = {
  "bg-sky-50 text-sky-600": "workspace-tone-sky",
  "bg-emerald-50 text-emerald-600": "workspace-tone-emerald",
  "bg-indigo-50 text-indigo-600": "workspace-tone-indigo",
  "bg-violet-50 text-violet-600": "workspace-tone-violet",
  "bg-amber-50 text-amber-600": "workspace-tone-amber",
  "bg-rose-50 text-rose-600": "workspace-tone-rose",
};

function getToneClassName(toneClassName?: string): string {
  if (!toneClassName) {
    return "workspace-tone-sky";
  }

  return LEGACY_TONE_CLASS_MAP[toneClassName] ?? toneClassName;
}

interface SuperAgentPageIntroProps {
  title: string;
  description: string;
  eyebrow?: string;
  summaryTitle?: string;
  summaryDescription?: string;
  children?: ReactNode;
}

interface SuperAgentMetricItem {
  label: string;
  value: ReactNode;
  helper: string;
  icon: ReactNode;
  toneClassName?: string;
}

interface SuperAgentSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

interface SuperAgentEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function SuperAgentPageIntro({
  title,
  description,
  eyebrow = "Super agent workspace",
  summaryTitle,
  summaryDescription,
  children,
}: SuperAgentPageIntroProps) {
  return (
    <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        {summaryTitle || summaryDescription || children ? (
          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap xl:w-auto xl:max-w-[52%] xl:items-start xl:justify-end">
            {summaryTitle || summaryDescription ? (
              <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[220px] sm:flex-1">
                {summaryTitle ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{summaryTitle}</p> : null}
                {summaryDescription ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{summaryDescription}</p> : null}
              </div>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SuperAgentMetricsGrid({ items }: { items: SuperAgentMetricItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{item.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.helper}</p>
            </div>
            <div className={cn("rounded-2xl p-2.5", getToneClassName(item.toneClassName))}>
              {item.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SuperAgentSection({ eyebrow, title, description, actions, children, className }: SuperAgentSectionProps) {
  return (
    <section className={cn("workspace-panel-surface rounded-[28px] p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p> : null}
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SuperAgentDataTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-panel-surface overflow-hidden rounded-[24px]">
      {children}
    </div>
  );
}

export function SuperAgentEmptyState({ icon, title, description }: SuperAgentEmptyStateProps) {
  return (
    <div className="workspace-empty-state flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="workspace-muted-pill rounded-[20px] p-3">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}