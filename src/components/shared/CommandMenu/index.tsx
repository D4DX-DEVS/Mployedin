"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { NavGroup } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";

interface CommandMenuProps {
  navGroups: NavGroup[];
  locale: string;
}

export function CommandMenu({ navGroups, locale }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [toggle]);

  function handleSelect(href: string) {
    router.push(href);
    setOpen(false);
  }

  const isAr = locale === "ar";
  const t = useTranslations("commandMenu");

  // Flatten: top-level items without children → standalone group,
  // items with children → one group per parent
  const standaloneItems = navGroups.flatMap((g) =>
    g.items.filter((item) => !item.children)
  );
  const groupedItems = navGroups.flatMap((g) =>
    g.items.filter((item) => item.children && item.children.length > 0)
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("noResults")}</CommandEmpty>

        {/* Standalone items (Dashboard, Notifications, Settings, etc.) */}
        {standaloneItems.length > 0 && (
          <CommandGroup heading={t("general")}>
            {standaloneItems.map((item) => {
              const Icon = getIcon(item.icon);
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.titleAr} ${item.description ?? ""}`}
                  onSelect={() => handleSelect(item.href)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{isAr ? item.titleAr : item.title}</span>
                    {(isAr ? item.descriptionAr : item.description) && (
                      <span className="text-xs text-muted-foreground">
                        {isAr ? item.descriptionAr : item.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Grouped items — each parent gets its own section */}
        {groupedItems.map((parent) => (
          <CommandGroup
            key={parent.href}
            heading={isAr ? parent.titleAr : parent.title}
          >
            {parent.children!.map((child) => {
              const Icon = getIcon(child.icon);
              return (
                <CommandItem
                  key={child.href}
                  value={`${parent.title} ${child.title} ${child.titleAr} ${child.description ?? ""}`}
                  onSelect={() => handleSelect(child.href)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{isAr ? child.titleAr : child.title}</span>
                    {(isAr ? child.descriptionAr : child.description) && (
                      <span className="text-xs text-muted-foreground">
                        {isAr ? child.descriptionAr : child.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

/** Trigger button shown in header */
export function CommandMenuTrigger({ locale }: { locale?: string }) {
  const t = useTranslations("commandMenu");
  return (
    <button
      onClick={() => {
        const event = new KeyboardEvent("keydown", {
          key: "k",
          metaKey: true,
          bubbles: true,
        });
        document.dispatchEvent(event);
      }}
      className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 hover:bg-muted border border-transparent hover:border-border px-3 py-1.5 rounded-md transition-all w-full max-w-sm"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left truncate">
        {t("searchShort")}
      </span>
      <kbd className="hidden sm:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium shrink-0">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
