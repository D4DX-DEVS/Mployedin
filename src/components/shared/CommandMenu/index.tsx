"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import type { NavItem } from "@/lib/nav/menuConfig";

interface CommandMenuProps {
  navItems: NavItem[];
  locale: string;
}

export function CommandMenu({ navItems, locale }: CommandMenuProps) {
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.title} ${item.titleAr}`}
              onSelect={() => handleSelect(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{locale === "ar" ? item.titleAr : item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Trigger button shown in header */
export function CommandMenuTrigger() {
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
      className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-lg transition-colors"
    >
      <span>Search...</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
