"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PersonOption {
  userId: string;
  name: string;
  email: string;
}

interface PeoplePickerProps {
  people: PersonOption[];
  values: string[];
  onChange: (values: string[]) => void;
  /** Visible label above the list. */
  label: string;
  loading?: boolean;
  emptyMessage: string;
}

/**
 * Pick one or many people for a task: search, tick, or "Select all shown".
 * Inline (not a popover) so it works inside the step dialog without clipping,
 * and a long team stays searchable.
 */
export function PeoplePicker({ people, values, onChange, label, loading, emptyMessage }: PeoplePickerProps) {
  const t = useTranslations("assignedTasks");
  const id = useId();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q)) : people;
  }, [people, query]);
  const picked = new Set(values);
  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.userId));

  const toggle = (userId: string) =>
    onChange(picked.has(userId) ? values.filter((v) => v !== userId) : [...values, userId]);
  const toggleShown = () => {
    if (allShownPicked) {
      const drop = new Set(shown.map((p) => p.userId));
      onChange(values.filter((v) => !drop.has(v)));
    } else {
      onChange([...new Set([...values, ...shown.map((p) => p.userId)])]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={`${id}-search`} className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground" aria-live="polite">{t("pickedCount", { count: values.length })}</span>
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPeople")}
            className="h-10 ps-8"
          />
        </div>
        <Button type="button" variant="outline" className="h-10 shrink-0" onClick={toggleShown} disabled={shown.length === 0}>
          {allShownPicked ? t("clearShown") : t("selectAllShown", { count: shown.length })}
        </Button>
      </div>
      <div role="group" aria-label={label} className="max-h-56 overflow-y-auto rounded-lg border">
        {loading ? (
          <p className="p-3 text-sm text-muted-foreground">{t("loadingTeam")}</p>
        ) : shown.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {shown.map((p) => {
              const on = picked.has(p.userId);
              return (
                <li key={p.userId}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(p.userId)}
                    className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name || p.email}</span>
                      {p.name && <span className="block truncate text-xs text-muted-foreground">{p.email}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
