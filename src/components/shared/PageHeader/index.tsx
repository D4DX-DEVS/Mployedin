import { cn } from "@/lib/utils";
import { Sparkles, type LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Leading identity icon shared by page headers across workspaces. */
  icon?: LucideIcon;
  className?: string;
  headingLevel?: 1 | 2;
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon = Sparkles,
  className,
  headingLevel = 1,
}: PageHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";

  return (
    <div
      className={cn(
        "page-header-root flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 pb-1",
        className
      )}
    >
      <div className="page-header-identity min-w-0">
        <span className="page-header-icon" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <Heading className="page-header-title text-xl sm:text-[1.625rem] font-bold tracking-tight text-foreground">
            {title}
          </Heading>
          {description && (
            <p className="page-header-description text-sm font-medium text-muted-foreground/80">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="page-header-actions flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>
      )}
    </div>
  );
}
