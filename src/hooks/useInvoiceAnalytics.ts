"use client";

import { useState, useEffect, useCallback } from "react";

export interface InvoiceAnalytics {
  kpi: {
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    overdueCount: number;
    taxCollected: number;
    refunds: number;
    totalInvoices: number;
    agentCommissionPayable: number;
    superAgentCommissionPayable: number;
    monthlyGrowth: number;
  };
  revenueByStatus: Array<{ _id: string; count: number; totalAmount: number; paidAmount: number; balanceDue: number }>;
  revenueByMonth: Array<{ label: string; revenue: number; paid: number; tax: number; count: number }>;
  revenueByCategory: Array<{ _id: string; count: number; totalAmount: number; paidAmount: number }>;
  topEmployers: Array<{ employerId: string; companyName: string; invoiceCount: number; totalPaid: number }>;
  invoiceAging: Array<{ _id: number | string; count: number; totalBalance: number }>;
  commissionSummary: Record<string, { count: number; amount: number }>;
}

export function useInvoiceAnalytics(period = "30d") {
  const [data, setData] = useState<InvoiceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/analytics?period=${period}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return { data, loading, error, refresh: fetchAnalytics };
}
