import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
    <DashboardPageHeader
      icon={Sparkles}
      eyebrow={eyebrow}
      title={title}
      description={description}
      summary={summaryTitle || summaryDescription ? {
        label: summaryTitle ?? eyebrow,
        value: summaryDescription ?? summaryTitle,
      } : undefined}
      actions={children}
    />
  );
}

export function SuperAgentMetricsGrid({ items }: { items: SuperAgentMetricItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="workspace-glass-panel rounded-2xl p-3.5 sm:p-4">
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
    <section className={cn("workspace-panel-surface rounded-[28px] p-3 sm:p-4 lg:p-5", className)}>
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
