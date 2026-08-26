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
  summary?: {
    label: string;
    value: ReactNode;
    note?: ReactNode;
  };
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
  // No default. It used to fall back to the English literal "Super agent
  // workspace", which 14 of 19 pages inherited — untranslated in /ar, and
  // restating what the sidebar already says. Pass one only when it adds
  // something the title does not.
  eyebrow,
  summary,
  summaryTitle,
  summaryDescription,
  children,
}: SuperAgentPageIntroProps) {
  const headerSummary = summary ?? (summaryTitle || summaryDescription ? {
    label: summaryTitle ?? eyebrow ?? title,
    value: summaryDescription ?? summaryTitle,
  } : undefined);

  return (
    <DashboardPageHeader
      icon={Sparkles}
      eyebrow={eyebrow}
      title={title}
      description={description}
      summary={headerSummary}
      actions={children}
      compactOnMobile
    />
  );
}

export function SuperAgentMetricsGrid({ items }: { items: SuperAgentMetricItem[] }) {
  return (
    <div
      className={cn(
        "grid gap-2 sm:gap-3",
        // This was an inline `repeat(N, minmax(0,1fr))` applied at every width,
        // so 4-5 tiles were pinned to a single row even on a 390px phone —
        // ~89px each, ~70px at five — and the label had to shrink to 9px to
        // fit. An inline style also can't be overridden by a breakpoint.
        // Two-up on phones, the real column count from `sm` up.
        "grid-cols-2",
        items.length === 1 && "sm:grid-cols-1",
        items.length === 2 && "sm:grid-cols-2",
        items.length === 3 && "sm:grid-cols-3",
        items.length === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        items.length >= 5 && "sm:grid-cols-3 lg:grid-cols-5",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="workspace-glass-panel rounded-lg sm:rounded-2xl card-pad">
          {/* Phones get label + value only; the helper sentence is desktop-only. */}
          <div className="flex flex-col items-start gap-0.5 sm:hidden">
            <p className="line-clamp-2 w-full text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{item.label}</p>
            <p className="w-full truncate text-lg font-semibold leading-tight tracking-tight text-foreground">{item.value}</p>
          </div>

          <div className="hidden sm:flex sm:items-start sm:justify-between sm:gap-3">
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
    <section className={cn("max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!shadow-none workspace-panel-surface rounded-3xl p-3 sm:p-4 lg:p-5", className)}>
      <div className="flex flex-col gap-2 sm:gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          {/* The eyebrow is the disposable half, so it is what drops on a phone.
              This was inverted: the <h2> carried `eyebrow && "hidden sm:block"`,
              so 24 of 27 sections showed only an uppercase kicker ("REQUESTS",
              "RANKINGS") on mobile while the real heading was hidden. */}
          {eyebrow ? (
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">{eyebrow}</p>
          ) : null}
          <h2 className="text-sm font-semibold tracking-tight text-foreground sm:mt-2 sm:text-xl">{title}</h2>
          {description ? <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3 sm:mt-5">{children}</div>
    </section>
  );
}

export function SuperAgentDataTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-panel-surface overflow-hidden rounded-3xl">
      {children}
    </div>
  );
}

export function SuperAgentEmptyState({ icon, title, description }: SuperAgentEmptyStateProps) {
  return (
    <div className="workspace-empty-state flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="workspace-muted-pill rounded-3xl p-3">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
