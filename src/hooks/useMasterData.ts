"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

/**
 * Master-data lookup lists managed by the admin under Master Data.
 * One hook for every category served by /api/master-data/<category>, so a
 * form option the admin renames, translates, reorders or retires changes
 * everywhere without a deploy.
 */
export type MasterDataCategory =
  | "job-roles"
  | "functional-areas"
  | "industries"
  | "job-skills"
  | "job-types"
  | "job-shifts"
  | "career-levels"
  | "job-experiences"
  | "benefits"
  | "genders"
  | "marital-statuses"
  | "nationalities"
  | "visa-statuses"
  | "notice-periods"
  | "languages"
  | "language-levels"
  | "ownership-types"
  | "company-sizes"
  | "degree-levels"
  | "degree-types"
  | "major-subjects"
  | "result-types"
  | "currencies"
  | "salary-periods";

export interface MasterDataItem {
  _id: string;
  name: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  /** Category-specific extras (currencies: code/symbol; languages: code; job-roles: functionalArea/aliases; nationalities: countryCode). */
  code?: string;
  symbol?: string;
  decimalDigits?: number;
  nativeName?: string;
  functionalArea?: string;
  aliases?: string[];
  countryCode?: string;
}

export interface MasterDataOption {
  /** Stable value stored in the record — the English name unless `valueKey` says otherwise. */
  value: string;
  /** Localised display label. */
  label: string;
  item: MasterDataItem;
}

interface MasterDataResponse {
  category: string;
  items: MasterDataItem[];
}

export const masterDataKeys = {
  all: ["master-data"] as const,
  list: (category: MasterDataCategory, q: string, limit: number) => [...masterDataKeys.all, category, q, limit] as const,
};

async function fetchMasterData(category: MasterDataCategory, q: string, limit: number): Promise<MasterDataItem[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  const res = await fetch(`/api/master-data/${category}?${params}`);
  if (!res.ok) throw new Error(`Failed to load ${category}`);
  const data: MasterDataResponse = await res.json();
  return data.items;
}

export interface UseMasterDataOptions {
  /** Search query for big lists (job roles, skills); leave empty to load the whole list. */
  q?: string;
  limit?: number;
  /** Which field becomes the option value. Default "name" (what existing free-text fields store). */
  valueKey?: "name" | "slug" | "code";
  enabled?: boolean;
}

/** Localised label for a master-data item. */
export function masterDataLabel(item: Pick<MasterDataItem, "name" | "nameAr">, locale: string): string {
  return locale === "ar" && item.nameAr ? item.nameAr : item.name;
}

export function useMasterData(category: MasterDataCategory, { q = "", limit = 500, valueKey = "name", enabled = true }: UseMasterDataOptions = {}) {
  const locale = useLocale();
  const query = useQuery({
    queryKey: masterDataKeys.list(category, q, limit),
    queryFn: () => fetchMasterData(category, q, limit),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const items = query.data ?? [];
  const options: MasterDataOption[] = items.map((item) => ({
    value: String((valueKey === "name" ? item.name : item[valueKey]) ?? item.name),
    label: masterDataLabel(item, locale),
    item,
  }));
  return { ...query, items, options };
}
