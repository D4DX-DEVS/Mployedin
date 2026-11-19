import { useCallback } from "react";

export interface CommissionRateResponse {
  history: Array<{
    rate: number;
    effectiveFrom: string | Date;
    setByRole?: "admin" | "super_agent";
    setBy?: string;
    reason?: string;
    setAt?: string | Date;
  }>;
  current: {
    rate?: number;
    source: "employer_rate" | "none";
  };
}

export function useCommissionRate(endpoint: "admin" | "super_agent" | "agent") {
  const fetchRate = useCallback(
    async (employerId: string): Promise<CommissionRateResponse> => {
      const prefix = endpoint === "admin" ? "/api/admin" : endpoint === "super_agent" ? "/api/super-agent" : "/api/agent";
      const res = await fetch(`${prefix}/employers/${employerId}/agent-rate`);
      if (!res.ok) {
        throw new Error("Failed to fetch rate");
      }
      return res.json();
    },
    [endpoint]
  );

  const setRate = useCallback(
    async (
      employerId: string,
      rate: number,
      effectiveFrom: string,
      reason: string
    ): Promise<void> => {
      if (endpoint === "agent") {
        throw new Error("Agents cannot set rates");
      }

      const prefix = endpoint === "admin" ? "/api/admin" : "/api/super-agent";
      const res = await fetch(`${prefix}/employers/${employerId}/agent-rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate, effectiveFrom, reason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to set rate");
      }
    },
    [endpoint]
  );

  return { fetchRate, setRate };
}
