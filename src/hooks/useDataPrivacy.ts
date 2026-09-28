import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storeCookieChoice } from "@/lib/gdpr/cookieChoice";

// ── Types ──────────────────────────────────────────────────────────
export type DataRequestType = "export" | "delete" | "rectification" | "restrict";
export type DataRequestStatus = "pending" | "in_progress" | "completed" | "rejected" | "cancelled";

export interface DataRequest {
  _id: string;
  requestType: DataRequestType;
  status: DataRequestStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface ConsentState {
  granted: boolean;
  at: string;
  source: string | null;
}

export interface MyConsents {
  terms_and_privacy: ConsentState | null;
  cookies: ConsentState | null;
}

/** Why a deletion request was refused; the page words each one. */
export class DeletionRequestError extends Error {
  constructor(public readonly code: "ADMIN_ACCOUNT" | "REQUEST_OPEN" | "UNKNOWN") {
    super(code);
    this.name = "DeletionRequestError";
  }
}

/** The export was refused because today's allowance is used up. */
export class ExportLimitError extends Error {
  constructor() {
    super("EXPORT_LIMIT");
    this.name = "ExportLimitError";
  }
}

// ── Query Keys ─────────────────────────────────────────────────────
export const dataPrivacyKeys = {
  all: ["data-privacy"] as const,
  requests: () => [...dataPrivacyKeys.all, "requests"] as const,
  consents: () => [...dataPrivacyKeys.all, "consents"] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────

/** The signed-in user's own data requests, newest first. */
export function useMyDataRequests() {
  return useQuery({
    queryKey: dataPrivacyKeys.requests(),
    queryFn: async (): Promise<DataRequest[]> => {
      const res = await fetch("/api/gdpr/requests");
      if (!res.ok) throw new Error("Could not load data requests");
      const data = (await res.json()) as { requests?: DataRequest[] };
      return data.requests ?? [];
    },
  });
}

/** The latest recorded Terms & Privacy and cookie answers. */
export function useMyConsents() {
  return useQuery({
    queryKey: dataPrivacyKeys.consents(),
    queryFn: async (): Promise<MyConsents> => {
      const res = await fetch("/api/user/consent");
      if (!res.ok) throw new Error("Could not load consents");
      const data = (await res.json()) as { consents?: Partial<MyConsents> };
      return {
        terms_and_privacy: data.consents?.terms_and_privacy ?? null,
        cookies: data.consents?.cookies ?? null,
      };
    },
  });
}

/** Ask for the account to be deleted. An admin completes it from the GDPR register. */
export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch("/api/gdpr/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "delete", ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        throw new DeletionRequestError(
          body.code === "ADMIN_ACCOUNT" || body.code === "REQUEST_OPEN" ? body.code : "UNKNOWN",
        );
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataPrivacyKeys.requests() }),
  });
}

/** Withdraw a request an admin has not started yet. */
export function useCancelDataRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/gdpr/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error("Could not cancel the request");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataPrivacyKeys.requests() }),
  });
}

/** Change the cookie answer: this browser's copy and the consent log together. */
export function useSetCookieConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (granted: boolean) => {
      const res = await fetch("/api/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType: "cookies", granted, source: "privacy_settings" }),
      });
      if (!res.ok) throw new Error("Could not save the cookie choice");
      storeCookieChoice(granted ? "accepted" : "declined");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataPrivacyKeys.consents() }),
  });
}

/** Download everything held about the user as a JSON file (3 a day). */
export function useDownloadMyData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gdpr/export");
      if (res.status === 429) throw new ExportLimitError();
      if (!res.ok) throw new Error("Could not export data");
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mployedin-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
    // The export is recorded in the register, so it shows in the history.
    onSettled: () => queryClient.invalidateQueries({ queryKey: dataPrivacyKeys.requests() }),
  });
}
