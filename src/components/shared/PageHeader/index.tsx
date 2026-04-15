import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "page-header-root flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 pb-1",
        className
      )}
    >
      <div className="space-y-1.5">
        <h1 className="page-header-title text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="page-header-description text-[15px] font-medium text-muted-foreground/80">{description}</p>
        )}
      </div>
      {actions && (
        <div className="page-header-actions flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
