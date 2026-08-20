import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
}

export function PageHeader({
  title,
  description,
  actions,
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
      <div className="min-w-0 space-y-1.5">
        <Heading className="page-header-title text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {title}
        </Heading>
        {description && (
          <p className="page-header-description text-[15px] font-medium text-muted-foreground/80">{description}</p>
        )}
      </div>
      {actions && (
        <div className="page-header-actions flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 sm:w-auto sm:shrink-0 sm:flex-wrap sm:overflow-visible">{actions}</div>
      )}
    </div>
  );
}
