import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeroProps {
  /** Large page title. Also shown in the eyebrow badge unless `eyebrow` overrides it. */
  title: string;
  /** Supporting sentence shown beneath the title. */
  description?: string;
  /** Short uppercase label inside the badge. Defaults to `title` (matches existing hero pages). */
  eyebrow?: string;
  /** Icon rendered inside the eyebrow badge. Defaults to `Sparkles`. */
  icon?: LucideIcon;
  /** Right-aligned content (buttons, filters, stat pills). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard dashboard hero header. Renders the shared `workspace-hero-surface`
 * card used across the employer module (dashboard, analytics, jobs, …) so every
 * top-level page shares one consistent header treatment.
 */
export function PageHero({
  title,
  description,
  eyebrow,
  icon: Icon = Sparkles,
  actions,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        "workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7",
        className
      )}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
            <Icon className="h-3.5 w-3.5" />
            {eyebrow ?? title}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
    </section>
  );
}
