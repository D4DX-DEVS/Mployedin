"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import type { CountryRevenue } from "./useSubscriptionDashboard";

interface RevenueByCountryProps {
  data: CountryRevenue[];
}

function formatCurrency(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n);
}

/* The subscription dashboard bills in a single currency and the payload carries
   no currency field. Kept as a code here rather than inside the translations so
   switching it later is a one-line change, not a message edit in every locale. */
const BILLING_CURRENCY = "AED";

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
  const t = useTranslations("revenueByCountry");
  const locale = useLocale();
  const totalRevenue = data.reduce((sum, c) => sum + c.revenue, 0);
  const totalMarkets = data.length;

  return (
    <section className="rounded-2xl border border-border/60 bg-card panel-body">
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Globe className="h-4 w-4" /> {t("title")}
        </h4>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("noCountryData")}</p>
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.country} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-base">{COUNTRY_FLAGS[c.country] ?? "🌍"}</span>
                  <span className="font-medium">{c.country}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(c.revenue, locale)}</span>
                  <span className="text-xs text-muted-foreground">{c.percentage}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(c.percentage, 2)}%` }}
                />
              </div>
            </div>
          ))}

          {/* Total summary. The plural of "market" is an ICU choice in the
              message, not an appended "s" — Arabic has no equivalent rule. */}
          <div className="mt-4 pt-3 border-t border-border/40">
            <p className="text-xs text-muted-foreground text-center">
              {t.rich("totalBilled", {
                amount: formatCurrency(totalRevenue, locale),
                currency: BILLING_CURRENCY,
                markets: totalMarkets,
                strong: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              })}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
