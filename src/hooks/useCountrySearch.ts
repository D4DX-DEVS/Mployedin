import { useQuery } from "@tanstack/react-query";

export interface CountryOption {
  name: string;
  code: string;
  currencyCode: string;
  currencySymbol: string;
}

interface CountrySearchResponse {
  countries: CountryOption[];
}

export const countryKeys = {
  all: ["countries"] as const,
  search: (query: string) => [...countryKeys.all, "search", query] as const,
};

async function fetchCountries(query: string): Promise<CountryOption[]> {
  const params = new URLSearchParams({
    q: query,
    limit: query ? "10" : "50",
  });

  const response = await fetch(`/api/countries?${params}`);
  
  if (!response.ok) {
    throw new Error("Failed to fetch countries");
  }

  const data: CountrySearchResponse = await response.json();
  return data.countries;
}

export function useCountrySearch(query: string, options?: { loadAll?: boolean }) {
  return useQuery({
    queryKey: countryKeys.search(query),
    queryFn: () => fetchCountries(query),
    enabled: options?.loadAll || query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
