import { useQuery } from "@tanstack/react-query";

export interface CountryOption {
  name: string;
  /** Arabic name (may be empty for countries without a translation). */
  nameAr?: string;
  code: string;
  currencyCode: string;
  currencySymbol: string;
  /** International dialling prefix without the leading "+", e.g. "971". */
  phoneCode?: string;
}

interface CountrySearchResponse {
  countries: CountryOption[];
}

/** Enough to cover every country the admin can activate (ISO has ~250). */
export const ALL_COUNTRIES_LIMIT = 300;

export const countryKeys = {
  all: ["countries"] as const,
  search: (query: string, limit?: number) => [...countryKeys.all, "search", query, limit ?? null] as const,
};

async function fetchCountries(query: string, limit?: number): Promise<CountryOption[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit ?? (query ? 10 : 50)),
  });

  const response = await fetch(`/api/countries?${params}`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch countries");
  }

  const data: CountrySearchResponse = await response.json();
  return data.countries;
}

/**
 * Country lookup against the admin-managed Countries table.
 * `loadAll` fetches the whole active list (up to `limit`, default
 * ALL_COUNTRIES_LIMIT) so a select can filter locally.
 */
export function useCountrySearch(query: string, options?: { loadAll?: boolean; limit?: number }) {
  const limit = options?.limit ?? (options?.loadAll ? ALL_COUNTRIES_LIMIT : undefined);
  return useQuery({
    queryKey: countryKeys.search(query, limit),
    queryFn: () => fetchCountries(query, limit),
    enabled: options?.loadAll || query.length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
