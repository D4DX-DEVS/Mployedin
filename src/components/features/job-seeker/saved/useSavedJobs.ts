"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { csrfFetch } from "@/lib/security/csrf-client";

export const SAVED_JOB_IDS_KEY = ["saved-job-ids"] as const;
export const SAVED_JOBS_LIST_KEY = ["saved-jobs"] as const;

/** Which jobs the seeker has saved, shared by every save button on the page. */
export function useSavedJobIds(): { ids: ReadonlySet<string>; ready: boolean } {
  const { data, isSuccess } = useQuery<{ ids: string[] }>({
    queryKey: SAVED_JOB_IDS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/saved-jobs/ids");
      if (!res.ok) throw new Error(`saved-jobs/ids ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
  return { ids: new Set(data?.ids ?? []), ready: isSuccess };
}

export class SaveJobError extends Error {
  constructor(public readonly status: number) {
    super(`save job ${status}`);
  }
}

/**
 * Save or unsave one job. The id list updates at once (optimistic) and rolls
 * back if the request fails; the Saved Jobs list re-reads afterwards.
 */
export function useToggleSavedJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, save }: { jobId: string; save: boolean }) => {
      const res = await csrfFetch(`/api/saved-jobs/${jobId}`, { method: save ? "PUT" : "DELETE" });
      if (!res.ok) throw new SaveJobError(res.status);
      return save;
    },
    onMutate: async ({ jobId, save }) => {
      await queryClient.cancelQueries({ queryKey: SAVED_JOB_IDS_KEY });
      const previous = queryClient.getQueryData<{ ids: string[] }>(SAVED_JOB_IDS_KEY);
      const ids = (previous?.ids ?? []).filter((id) => id !== jobId);
      queryClient.setQueryData(SAVED_JOB_IDS_KEY, { ids: save ? [jobId, ...ids] : ids });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(SAVED_JOB_IDS_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_JOB_IDS_KEY });
      void queryClient.invalidateQueries({ queryKey: SAVED_JOBS_LIST_KEY });
    },
  });
}
