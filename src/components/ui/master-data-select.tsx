"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useMasterData, type MasterDataCategory, type MasterDataOption } from "@/hooks/useMasterData";

interface MasterDataSelectProps {
  category: MasterDataCategory;
  value?: string;
  onValueChange: (value: string, option?: MasterDataOption) => void;
  placeholder?: string;
  /** Which field is stored as the value; "name" matches the existing free-text fields. */
  valueKey?: "name" | "slug" | "code";
  /** Options shown while the list loads or if the API fails, e.g. the old hardcoded array. */
  fallback?: SearchableSelectOption[];
  /** Big lists (job roles, skills) search the server; small ones filter locally. */
  remoteSearch?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * A select fed by an admin-managed lookup table. Drop-in for the hardcoded
 * option arrays: same `value` semantics (English name by default), localised
 * labels, optional server-side search for the long lists.
 */
export function MasterDataSelect({ category, value, onValueChange, placeholder, valueKey = "name", fallback = [], remoteSearch = false, disabled, className, id, ...rest }: MasterDataSelectProps) {
  const t = useTranslations("masterDataSelect");
  const [search, setSearch] = useState("");
  const { options, isPending, isError } = useMasterData(category, { valueKey, q: remoteSearch ? search : "", limit: remoteSearch ? 25 : 500 });
  const list: SearchableSelectOption[] = options.length > 0 || (!isPending && !isError) ? options.map((o) => ({ value: o.value, label: o.label })) : fallback;
  // Keep a stored value visible even when it is no longer in the active list.
  const current = value && !list.some((o) => o.value === value) ? [{ value, label: value }, ...list] : list;
  return (
    <SearchableSelect
      id={id}
      className={className}
      options={current}
      value={value}
      onValueChange={(next) => onValueChange(next, options.find((o) => o.value === next))}
      placeholder={placeholder ?? t("select")}
      onSearchValueChange={remoteSearch ? setSearch : undefined}
      disabled={disabled}
      ariaLabel={rest["aria-label"]}
      loading={isPending}
    />
  );
}
