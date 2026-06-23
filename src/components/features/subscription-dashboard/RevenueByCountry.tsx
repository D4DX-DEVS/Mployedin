"use client";

import { Globe } from "lucide-react";
import type { CountryRevenue } from "./useSubscriptionDashboard";

interface RevenueByCountryProps {
  data: CountryRevenue[];
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

const COUNTRY_FLAGS: Record<string, string> = {
  UAE: "🇦🇪",
  "United Arab Emirates": "🇦🇪",
  India: "🇮🇳",
  "Saudi Arabia": "🇸🇦",
  Qatar: "🇶🇦",
  Kuwait: "🇰🇼",
  Bahrain: "🇧🇭",
  Oman: "🇴🇲",
  Pakistan: "🇵🇰",
  Egypt: "🇪🇬",
  Jordan: "🇯🇴",
  Unknown: "🌍",
};

export function RevenueByCountry({ data }: RevenueByCountryProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Globe className="h-4 w-4" /> Revenue by Country
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">View report</span>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No country data available</p>
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.country} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">{COUNTRY_FLAGS[c.country] ?? "🌍"}</span>
                  <span className="font-medium">{c.country}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(c.revenue)} AED</span>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {c.percentage}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all duration-500"
                  style={{ width: `${Math.max(c.percentage, 2)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
