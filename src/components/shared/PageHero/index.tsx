import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import {
  DashboardPageHeader,
  type DashboardHeaderMetric,
} from "@/components/shared/DashboardPageHeader";

interface PageHeroProps {
  /** Large page title. Also shown in the eyebrow badge unless `eyebrow` overrides it. */
  title: string;
  /** Supporting sentence shown beneath the title. */
  description?: string;
  /** Short uppercase label inside the badge. Omit it unless the label says
   *  something the title does not — defaulting it to `title` printed every
   *  page heading twice. */
  eyebrow?: string;
  /** Icon rendered inside the eyebrow badge. Defaults to `Sparkles`. */
  icon?: LucideIcon;
  /** Right-aligned content (buttons, filters, stat pills). */
  actions?: ReactNode;
  /**
   * Totals rendered as a divided strip *inside* the header panel.
   *
   * `DashboardPageHeader` has supported this all along; PageHero did not
   * forward it, so twelve admin pages rendered the hero card and then a second,
   * separate grid of stat cards underneath — two disconnected blocks where
   * employer's `WorkspaceHeader` shows one. Pass the page's totals here and
   * delete the grid.
   */
  metrics?: readonly DashboardHeaderMetric[];
  metricsClassName?: string;
  /** Phones: single-row metric strip (value over label). See DashboardPageHeader. */
  compactMetrics?: boolean;
  /** Phones only: title and actions share one row (see DashboardPageHeader). */
  compact?: boolean;
  /** Phones: drop the explanatory description (see DashboardPageHeader). */
  compactOnMobile?: boolean;
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
  metrics,
  metricsClassName,
  compact = false,
  compactOnMobile = false,
  compactMetrics = false,
  className,
}: PageHeroProps) {
  return (
    <DashboardPageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      icon={Icon}
      actions={actions}
      metrics={metrics}
      metricsClassName={metricsClassName}
      compact={compact}
      compactOnMobile={compactOnMobile}
      compactMetrics={compactMetrics}
      className={className}
    />
  );
}
