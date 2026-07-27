import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
  actions?: ReactNode;
  className?: string;
}

/**
 * Standard dashboard hero header. Renders the shared `dashboard-page-header workspace-hero-surface`
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
    <DashboardPageHeader
      eyebrow={eyebrow ?? title}
      title={title}
      description={description}
      icon={Icon}
      actions={actions}
      className={className}
    />
  );
}
