import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  fallbackJobCategoryItems,
  jobCategoryOptions,
  type JobCategoryItem,
  type JobCategoryOption,
} from "@/lib/jobs/jobCategories";

export const jobCategoryKeys = {
  all: ["job-categories"] as const,
};

/** The admin-managed job categories. Falls back to the starting set if the request fails. */
export function useJobCategories() {
  return useQuery({
    queryKey: jobCategoryKeys.all,
    queryFn: async (): Promise<JobCategoryItem[]> => {
      const res = await fetch("/api/job-categories");
      if (!res.ok) throw new Error(`job categories ${res.status}`);
      const data = (await res.json()) as { items?: JobCategoryItem[] };
      return data.items ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Localised select options for a job form. `current` is the job's saved value;
 * it stays selectable even when the admin list no longer contains it.
 */
export function useJobCategoryOptions(current?: string | null): JobCategoryOption[] {
  const locale = useLocale();
  const { data, isError } = useJobCategories();
  return useMemo(() => {
    const items = data && data.length > 0 ? data : isError ? fallbackJobCategoryItems() : [];
    return jobCategoryOptions(items, locale, current);
  }, [data, isError, locale, current]);
}
