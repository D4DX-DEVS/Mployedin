import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-dashed border-border/70 bg-muted/10 px-6 py-16 text-center",
        className
      )}
    >
      {Icon && <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
