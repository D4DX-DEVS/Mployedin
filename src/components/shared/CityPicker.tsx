"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { RequiredMark } from "@/components/ui/required-mark";
import { SearchableSelect } from "@/components/ui/searchable-select";

/**
 * One catalogue city, searched on the server within a country.
 *
 * A typed city is free text nobody can match against a territory; a picked one
 * carries the catalogue id that decides which super-agents and agents cover the
 * record. Labels come from the caller so the component works in any message
 * namespace (the public/auth groups ship only a few).
 */

export interface PickedCity {
  id: string;
  name: string;
}

interface CityResult {
  _id: string;
  name: string;
  stateName?: string;
}

interface CityPickerProps {
  /** ISO 3166-1 alpha-2; the search is limited to this country. */
  countryCode: string;
  value: PickedCity | null;
  onChange: (city: PickedCity | null) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  /** Shown before the user has typed enough to search. */
  typeToSearchMessage: string;
  emptyMessage: string;
  loadingMessage: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  /** Inside a Dialog: portal the list into it and trap focus (SearchableSelect). */
  container?: HTMLElement | null;
  modal?: boolean;
}

const MIN_QUERY = 2;

export function CityPicker({
  countryCode,
  value,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  typeToSearchMessage,
  emptyMessage,
  loadingMessage,
  error,
  hint,
  required,
  disabled,
  container,
  modal,
}: CityPickerProps) {
  const generatedId = useId();
  const controlId = `city-picker-${generatedId}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY || !countryCode) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ search: q, country: countryCode });
      fetch(`/api/filters/locations?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data: { results?: CityResult[] }) => setResults(data.results ?? []))
        .catch(() => { /* aborted or offline — keep the last list */ })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, countryCode]);

  const options = useMemo(() => {
    const list = results.map((c) => ({
      value: c._id,
      label: c.stateName ? `${c.name}, ${c.stateName}` : c.name,
      triggerLabel: c.name,
    }));
    // Keep the current pick resolvable on the closed trigger.
    if (value && !list.some((o) => o.value === value.id)) {
      list.unshift({ value: value.id, label: value.name, triggerLabel: value.name });
    }
    return list;
  }, [results, value]);

  return (
    <div
      className="space-y-1"
      role="group"
      aria-labelledby={labelId}
    >
      <label id={labelId} htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
        {label} {required && <RequiredMark />}
      </label>
      <SearchableSelect
        id={controlId}
        ariaLabel={label}
        ariaRequired={required}
        ariaInvalid={Boolean(error)}
        ariaDescribedBy={error ? errorId : hint ? hintId : undefined}
        options={options}
        value={value?.id ?? ""}
        onValueChange={(id) => {
          if (value && id === value.id) return;
          const picked = results.find((c) => c._id === id);
          onChange(picked ? { id: picked._id, name: picked.name } : null);
        }}
        searchValue={query}
        onSearchValueChange={setQuery}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={query.trim().length < MIN_QUERY ? typeToSearchMessage : emptyMessage}
        loading={loading}
        loadingMessage={loadingMessage}
        disabled={disabled || !countryCode}
        className={error ? "border-destructive" : undefined}
        container={container}
        modal={modal}
      />
      {error && <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
