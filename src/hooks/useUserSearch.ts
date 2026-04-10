"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";

export interface SearchUser {
  _id: string;
  name: string;
  role: string;
  avatar?: string;
  headline?: string;
  companyName?: string;
  companyLogo?: string;
}

interface SearchResponse {
  users: SearchUser[];
}

export const userSearchKeys = {
  all: ["user-search"] as const,
  query: (q: string) => [...userSearchKeys.all, q] as const,
};

async function fetchUserSearch(query: string): Promise<SearchUser[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search failed");
  const data: SearchResponse = await res.json();
  return data.users;
}

export function useUserSearch(query: string) {
  const debounced = useDebounce(query, 300);

  return useQuery({
    queryKey: userSearchKeys.query(debounced),
    queryFn: () => fetchUserSearch(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
