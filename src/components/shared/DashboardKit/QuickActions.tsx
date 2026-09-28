import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** First action renders as the primary button. */
  primary?: boolean;
}

/** A row of the two-to-five things the user most often comes to the dashboard to do. */
export function QuickActions({ actions, ariaLabel }: { actions: readonly QuickAction[]; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.key}>
              <Link
                href={action.href}
                className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors ${
                  action.primary
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {action.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
