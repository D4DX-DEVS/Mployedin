"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaxonomyType } from "@/lib/taxonomy/seeds";

/**
 * Debounced taxonomy search hook. Hits the public /api/taxonomy endpoint and
 * returns suggestion strings for the given type + query.
 *
 * `fresh` is false while `items` still answer an earlier query — during the
 * debounce and the request. A keyboard shortcut must not act on those: typing
 * "React" and pressing Enter at once used to add "JavaScript", the first
 * suggestion for "Jav…".
 */
function useTaxonomySearch(type: TaxonomyType, query: string, debounceMs = 200) {
  const [result, setResult] = React.useState<{ query: string; items: string[] }>({ query: "", items: [] });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/taxonomy?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}&limit=12`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { items?: string[] };
        if (active) setResult({ query, items: data.items ?? [] });
      } catch {
        /* aborted or network error — keep previous items */
      } finally {
        if (active) setLoading(false);
      }
    }, debounceMs);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(handle);
    };
  }, [type, query, debounceMs]);

  return { items: result.items, loading, fresh: result.query === query };
}

function useOutsideClick(onOutside: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onOutside]);
  return ref;
}

// ─── Multi-select tag autocomplete ──────────────────────────────────────────

interface TagAutocompleteProps {
  type: TaxonomyType;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  /** Allow adding free-text values not present in suggestions (default: true). */
  allowCustom?: boolean;
  className?: string;
  id?: string;
  /** Accessible name when no <label htmlFor={id}> points at the input. */
  ariaLabel?: string;
}

/**
 * Chip-style multi-select input backed by /api/taxonomy. Type to search, click a
 * suggestion or press Enter/comma to add, and remove with the × on each chip.
 */
export function TagAutocomplete({
  type,
  value,
  onChange,
  placeholder = "Type to search…",
  max = 20,
  allowCustom = true,
  className,
  id,
  ariaLabel,
}: TagAutocompleteProps) {
  const t = useTranslations("common");
  const [input, setInput] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const { items, loading, fresh } = useTaxonomySearch(type, input);
  const containerRef = useOutsideClick(() => setOpen(false));

  const lowerValue = value.map((v) => v.toLowerCase());
  const suggestions = items.filter((s) => !lowerValue.includes(s.toLowerCase()));

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.length >= max) return;
    if (lowerValue.includes(trimmed.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, trimmed]);
    setInput("");
    setActiveIndex(-1);
  };

  const remove = (tag: string) => onChange(value.filter((v) => v !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      // Only suggestions that answer what is typed NOW count — a highlight can
      // sit on a stale one (the mouse hovering where the old list was). Then an
      // exact match keeps the canonical spelling, then free text, then (for
      // closed lists) the top suggestion.
      const exact = fresh ? suggestions.find((s) => s.toLowerCase() === input.trim().toLowerCase()) : undefined;
      if (fresh && activeIndex >= 0 && suggestions[activeIndex]) add(suggestions[activeIndex]);
      else if (exact) add(exact);
      else if (allowCustom) add(input);
      else if (fresh && suggestions[0]) add(suggestions[0]);
    } else if (e.key === "Backspace" && !input && value.length) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex flex-wrap gap-1.5 sm:gap-2 rounded-lg border border-border bg-background min-h-[44px] focus-within:border-primary transition-colors chip-pad">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 rounded-full bg-muted border border-border text-xs sm:text-sm text-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <input
            id={id}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : t("addMore")}
            aria-label={ariaLabel}
            autoComplete="off"
            className="outline-none text-sm flex-1 min-w-[90px] sm:min-w-[150px] bg-transparent text-foreground placeholder:text-muted-foreground"
          />
        )}
      </div>

      {open && (input.trim().length > 0 || suggestions.length > 0) && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          )}
          {suggestions.map((s, idx) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors",
                idx === activeIndex && "bg-accent"
              )}
            >
              {s}
            </button>
          ))}
          {allowCustom && input.trim() && !suggestions.some((s) => s.toLowerCase() === input.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(input)}
              className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-accent transition-colors flex items-center gap-2 border-t border-border"
            >
              <Plus className="w-3.5 h-3.5" /> Add &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single-value autocomplete ──────────────────────────────────────────────

interface AutocompleteProps {
  type: TaxonomyType;
  value: string;
  onChange: (next: string) => void;
  /**
   * Fired only when the value is *settled* — a suggestion was picked or Enter
   * was pressed — never on an intermediate keystroke.
   *
   * `onChange` runs on every character, so a caller that treats it as "the user
   * is done" latches after the first letter. That is exactly how onboarding's
   * specialization field ended up storing "C" for "Computer Science": it set a
   * `confirmed` flag inside onChange, and the confirmed branch swapped this
   * input out for a chip mid-word. Use this for that kind of transition.
   */
  onCommit?: (next: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
}

/**
 * Single-value text input with a taxonomy-backed suggestion dropdown. Reports
 * every keystroke through onChange and settled values through onCommit.
 */
export function Autocomplete({
  type,
  value,
  onChange,
  onCommit,
  placeholder = "Type to search…",
  allowCustom = true,
  className,
  inputClassName,
  id,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const { items, loading, fresh } = useTaxonomySearch(type, value);
  // Clicking away is "I'm done typing", so it settles the value. This hook does
  // not fire for clicks inside the dropdown, which is why it is used here
  // instead of the input's onBlur — blur would beat a suggestion click and
  // commit the half-typed text instead of the option the user just picked.
  const containerRef = useOutsideClick(() => {
    setOpen(false);
    if (value.trim()) onCommit?.(value);
  });

  const suggestions = items.filter((s) => s.toLowerCase() !== value.trim().toLowerCase());

  const commit = (raw: string) => {
    onChange(raw);
    onCommit?.(raw);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Same rule as TagAutocomplete: never commit a suggestion for an older query.
      if (fresh && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        commit(suggestions[activeIndex]);
      } else if (!allowCustom && fresh && suggestions[0]) {
        e.preventDefault();
        commit(suggestions[0]);
      } else if (allowCustom && value.trim()) {
        // Free text the user typed themselves. Without this, Enter did nothing
        // unless a suggestion happened to be highlighted.
        e.preventDefault();
        commit(value.trim());
      }
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "h-11 w-full px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors",
          inputClassName
        )}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          )}
          {suggestions.map((s, idx) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(s)}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors",
                idx === activeIndex && "bg-accent"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
