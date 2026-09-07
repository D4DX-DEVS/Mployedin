"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getIcon } from "@/lib/nav/iconRegistry";
import { getQuickActions } from "@/lib/nav/quickActions";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

interface CreateMenuProps {
  locale: string;
  userRole?: string;
  /**
   * "topbar" is the desktop header control; "bottomBar" is the raised button
   * that sits in the middle of the phone tab bar, where the header is hidden.
   */
  variant?: "topbar" | "bottomBar";
  className?: string;
}

/**
 * "Create" wherever the user already is.
 *
 * Posting a job used to live only in the dashboard header, so making a second
 * one meant navigating home first. This reads the same quick-action registry as
 * the ⌘K palette, filtered to the entries that actually make something new.
 */
export function CreateMenu({ locale, userRole, variant = "topbar", className }: CreateMenuProps) {
  const router = useRouter();
  const t = useTranslations("quickActions");
  const { can } = usePermissions();

  const actions = getQuickActions(userRole, locale).filter(
    (action) =>
      action.create && (!action.permission || can(action.permission.resource, action.permission.action))
  );

  if (actions.length === 0) return null;

  const isBottomBar = variant === "bottomBar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("createMenu")}
          className={cn(
            isBottomBar
              ? "flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
              : "inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            className
          )}
        >
          <Plus className={isBottomBar ? "h-6 w-6" : "h-4 w-4"} />
          {!isBottomBar && <span className="hidden sm:inline">{t("create")}</span>}
        </button>
      </DropdownMenuTrigger>
      {/* The phone trigger sits in the middle of the tab bar, so the menu has to
          open centred over it — aligning to its end edge pushed the panel off to
          one side and over the page content.

          On phones it then spans the width as an action sheet rather than a
          17rem card floating over the middle of the page: a centred panel above
          a centred trigger is already sheet-shaped, so widening it and rounding
          only the reading edge is the whole change — no Sheet primitive, no
          second positioning system. */}
      <DropdownMenuContent
        align={isBottomBar ? "center" : "end"}
        side={isBottomBar ? "top" : "bottom"}
        sideOffset={isBottomBar ? 12 : 6}
        collisionPadding={isBottomBar ? 8 : 12}
        className={cn(
          isBottomBar
            ? "w-[calc(100vw-1rem)] rounded-2xl p-2 shadow-2xl shadow-black/15"
            : "w-[min(17rem,calc(100vw-1.5rem))]"
        )}
      >
        <DropdownMenuLabel className={cn(isBottomBar && "px-2 pb-1 pt-1.5")}>
          {t("createMenu")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action) => {
          const Icon = getIcon(action.icon);
          return (
            <DropdownMenuItem
              key={action.key}
              onSelect={() => router.push(action.href)}
              className={cn("gap-2.5 py-2.5", isBottomBar && "min-h-12 gap-3 px-2.5")}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm">{t(action.labelKey)}</span>
                {action.descriptionKey && (
                  <span className="text-xs text-muted-foreground">{t(action.descriptionKey)}</span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
