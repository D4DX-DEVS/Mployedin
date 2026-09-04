"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { getQuickActions } from "@/lib/nav/quickActions";
import { getEntitySearchRoutes } from "@/lib/nav/entitySearch";
import { usePermissions } from "@/hooks/usePermissions";

interface CommandMenuProps {
  navGroups: NavGroup[];
  locale: string;
  userRole?: string;
}

interface EntityHits {
  jobs: { id: string; title: string; status: string }[];
  candidates: { id: string; name: string; jobTitle: string; status: string }[];
  /* Employers, agents and platform users. The search API returns these for
     admin only — that workspace is mostly people lookups, and the palette had
     no way to answer one. Other roles receive an empty list and render no
     group. Each entry carries its own href because the destination depends on
     the record's role, not on the searching user. */
  people: { id: string; name: string; detail: string; href: string }[];
}

const NO_HITS: EntityHits = { jobs: [], candidates: [], people: [] };

export function CommandMenu({ navGroups, locale, userRole }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EntityHits>(NO_HITS);
  const router = useRouter();
  const pathname = usePathname();
  const { can } = usePermissions();

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
    setQuery("");
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
  const allItems = useMemo(
    () =>
      navGroups.flatMap((group) =>
        group.items.flatMap((item) => item.children?.length ? item.children : [item])
      ),
    [navGroups]
  );
  const recentItems = recentHrefs
    .map((href) => allItems.find((item) => item.href === href))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  useEffect(() => {
    const storageKey = `mployedin_recent_pages_${locale}`;
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecentHrefs(parsed.filter((value): value is string => typeof value === "string").slice(0, 5));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
  }, [locale]);

  useEffect(() => {
    const current = [...allItems]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (!current) return;

    const storageKey = `mployedin_recent_pages_${locale}`;
    setRecentHrefs((previous) => {
      const next = [current.href, ...previous.filter((href) => href !== current.href)].slice(0, 5);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [allItems, locale, pathname]);

  // ── Actions ───────────────────────────────────────────────────────
  // The palette used to answer only "where is X?". These entries answer
  // "do X", so the action does not depend on first navigating to the page
  // that happens to host its button.
  const tActions = useTranslations("quickActions");
  const quickActions = useMemo(
    () =>
      getQuickActions(userRole, locale).filter(
        (action) => !action.permission || can(action.permission.resource, action.permission.action)
      ),
    [userRole, locale, can]
  );

  // ── Entity search ─────────────────────────────────────────────────
  const entityRoutes = getEntitySearchRoutes(userRole);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!open || !entityRoutes || trimmedQuery.length < 2) {
      setHits(NO_HITS);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/workspace-search?q=${encodeURIComponent(trimmedQuery)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : NO_HITS))
        .then((data: EntityHits) =>
          setHits({
            jobs: data.jobs ?? [],
            candidates: data.candidates ?? [],
            people: data.people ?? [],
          })
        )
        .catch(() => {
          // An aborted or failed lookup leaves navigation and actions intact —
          // entity hits are an addition to the palette, never its content.
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
     
  }, [open, trimmedQuery, Boolean(entityRoutes)]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={entityRoutes ? t(entityRoutes.placeholderKey ?? "placeholderWithEntities") : t("placeholder")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{t("noResults")}</CommandEmpty>

        {quickActions.length > 0 && (
          <>
            <CommandGroup heading={t("actions")}>
              {quickActions.map((action) => {
                const Icon = getIcon(action.icon);
                return (
                  <CommandItem
                    key={action.key}
                    value={`${tActions(action.labelKey)} ${action.descriptionKey ? tActions(action.descriptionKey) : ""}`}
                    onSelect={() => handleSelect(action.href)}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0 text-primary" />
                    <div className="flex flex-col">
                      <span>{tActions(action.labelKey)}</span>
                      {action.descriptionKey && (
                        <span className="text-xs text-muted-foreground">
                          {tActions(action.descriptionKey)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {entityRoutes && hits.jobs.length > 0 && (
          <CommandGroup heading={t("jobsFound")}>
            {hits.jobs.map((job) => {
              const Icon = getIcon("Briefcase");
              return (
                <CommandItem
                  key={`job-${job.id}`}
                  value={`${job.title} ${trimmedQuery}`}
                  onSelect={() => handleSelect(`/${locale}${entityRoutes.job(job.id)}`)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{job.title}</span>
                    <span className="text-xs text-muted-foreground">{job.status}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {hits.people.length > 0 && (
          <CommandGroup heading={t("peopleFound")}>
            {hits.people.map((person) => {
              const Icon = getIcon("Building2");
              return (
                <CommandItem
                  key={`person-${person.id}`}
                  value={`${person.name} ${trimmedQuery}`}
                  onSelect={() => handleSelect(`/${locale}${person.href}`)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{person.name}</span>
                    {person.detail && (
                      <span className="text-xs text-muted-foreground">{person.detail}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {entityRoutes && hits.candidates.length > 0 && (
          <CommandGroup heading={t(entityRoutes.candidateHeadingKey ?? "candidatesFound")}>
            {hits.candidates.map((candidate) => {
              const Icon = getIcon("UserSearch");
              return (
                <CommandItem
                  key={`candidate-${candidate.id}`}
                  value={`${candidate.name} ${trimmedQuery}`}
                  onSelect={() => handleSelect(`/${locale}${entityRoutes.candidate(candidate.name)}`)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{candidate.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {candidate.jobTitle || candidate.status}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {recentItems.length > 0 && (
          <>
            <CommandGroup heading={t("recent")}>
              {recentItems.map((item) => {
                const Icon = getIcon(item.icon);
                return (
                  <CommandItem
                    key={`recent-${item.href}`}
                    value={`recent ${item.title} ${item.titleAr}`}
                    onSelect={() => handleSelect(item.href)}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{isAr ? item.titleAr : item.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

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
export function CommandMenuTrigger({ compact = false }: { locale?: string; compact?: boolean }) {
  const t = useTranslations("commandMenu");
  return (
    <button
      type="button"
      onClick={() => {
        const event = new KeyboardEvent("keydown", {
          key: "k",
          metaKey: true,
          bubbles: true,
        });
        document.dispatchEvent(event);
      }}
      aria-label={t("searchShort")}
      className={
        compact
          ? "flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          : "flex w-full max-w-sm items-center gap-2 rounded-md border border-transparent bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-all hover:border-border hover:bg-muted"
      }
    >
      <Search className="h-4 w-4 shrink-0" />
      {!compact && (
        <>
          <span className="flex-1 truncate text-left">
            {t("searchShort")}
          </span>
          <kbd className="pointer-events-none hidden h-5 shrink-0 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[11px] font-medium sm:inline-flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </>
      )}
    </button>
  );
}
