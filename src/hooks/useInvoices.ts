"use client";

/**
 * React Query hooks for invoice listing.
 *
 * - useInvoices(filters) — list invoices (admin: all, user: own)
 * - useInvoice(id)      — single invoice
 * - useUpdateInvoice()  — mark paid/void (admin only)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  _id: string;
  invoiceNumber: string;
  userId: string;
  subscriptionId: string;
  planId: string;
  type: "new" | "renewal" | "upgrade" | "downgrade";
  planName: string;
  description?: string;
  amount: number;
  currency: string;
  billingCycle: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "issued" | "paid" | "void";
  issuedAt: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

export interface InvoiceFilters {
  userId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (filters: InvoiceFilters) => [...invoiceKeys.lists(), filters] as const,
  detail: (id: string) => [...invoiceKeys.all, "detail", id] as const,
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchInvoices(filters: InvoiceFilters): Promise<InvoiceItem[]> {
  const params = new URLSearchParams();
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const res = await fetch(`/api/invoices?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load invoices");
  const data = await res.json();
  return data.invoices ?? [];
}

async function fetchInvoice(id: string): Promise<InvoiceItem> {
  const res = await fetch(`/api/invoices/${id}`);
  if (!res.ok) throw new Error("Failed to load invoice");
  const data = await res.json();
  return data.invoice;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** List invoices with optional filters. */
export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => fetchInvoices(filters),
    staleTime: 60 * 1000,
  });
}

/** Single invoice by ID. */
export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? ""),
    queryFn: () => fetchInvoice(id!),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/** Update invoice status (admin: mark paid/void). */
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; status?: "paid" | "void"; notes?: string }) => {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Update failed" }));
        throw new Error(err.error ?? "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
