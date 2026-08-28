"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrendingUp, Loader2, AlertTriangle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BenchmarkResult {
  p25: number;
  median: number;
  p75: number;
  currency: string;
  period: string;
  competitiveness: "below" | "competitive" | "above";
  insight: string;
}

interface Props {
  role: string;
  location: string;
  currency: string;
  period: string;
  salaryMin?: number;
  salaryMax?: number;
  /** Called when user clicks "Adjust to market rate" */
  onAdjust?: (min: number, max: number) => void;
}

function fmt(n: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function SalaryBenchmarkWidget({
  role,
  location,
  currency,
  period,
  salaryMin = 0,
  salaryMax = 0,
  onAdjust,
}: Props) {
  const t = useTranslations("employerJobForm.salaryBenchmark");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const [data, setData] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Track last fetched params to avoid redundant calls
  const lastFetchRef = useRef({ role: "", location: "", currency: "", period: "" });

  async function fetchBenchmark() {
    if (!role.trim()) return;
    const params = { role, location, currency, period };
    // Check if anything changed
    const last = lastFetchRef.current;
    if (
      last.role === role &&
      last.location === location &&
      last.currency === currency &&
      last.period === period
    ) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ role, location, seniority: "mid", currency, period });
      const res = await fetch(`/api/ai/salary-benchmark?${qs}`);
      if (!res.ok) throw new Error("Failed to fetch benchmark");
      const json = await res.json();
      setData(json as BenchmarkResult);
      lastFetchRef.current = params;
    } catch {
      setError(t("error"));
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on mount and whenever role, location, currency, or period changes.
  // lastFetchRef guard inside fetchBenchmark prevents redundant API calls.
  useEffect(() => {
    if (role.trim()) fetchBenchmark();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, location, currency, period]);

  if (!role.trim()) return null;

  const competitivenessConfig = {
    below: {
      color: "text-red-600",
      bg: "bg-red-50 border-red-200",
      bar: "bg-red-400",
      label: t("below"),
      icon: "↓",
    },
    competitive: {
      color: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-200",
      bar: "bg-emerald-400",
      label: t("competitive"),
      icon: "✓",
    },
    above: {
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200",
      bar: "bg-blue-400",
      label: t("above"),
      icon: "↑",
    },
  };

  const cfg = data ? competitivenessConfig[data.competitiveness] : null;

  // Compute where the employer's range sits on the p25-p75 bar
  function getBarPosition(value: number, min: number, max: number): number {
    if (max === min) return 50;
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  }

  const employerMid = salaryMin > 0 || salaryMax > 0 ? (salaryMin + salaryMax) / 2 : null;
  const markerPct =
    data && employerMid !== null
      ? getBarPosition(employerMid, data.p25, data.p75)
      : null;

  return (
    <div className={`rounded-xl border text-xs overflow-hidden transition-colors ${cfg?.bg ?? "bg-muted/30 border-border"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground/80">{t("title")}</span>
          {data && cfg && (
            <span className={`font-semibold ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!data && !loading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 text-primary"
              onClick={fetchBenchmark}
            >
              <Sparkles className="w-3 h-3" />
              {t("checkMarket")}
            </Button>
          )}
          {data && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground"
              onClick={fetchBenchmark}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "↻"}
              {t("refresh")}
            </Button>
          )}
          {data && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="px-3.5 pb-3 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("loading", { role })}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="px-3.5 pb-3 flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {/* Data */}
      {data && !collapsed && !loading && (
        <div className="px-3.5 pb-3 space-y-3">
          {/* Percentile bar */}
          <div className="relative">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>{t("p25", { amount: fmt(data.p25, data.currency, numberLocale) })}</span>
              <span className="font-medium text-foreground">{t("median", { amount: fmt(data.median, data.currency, numberLocale) })}</span>
              <span>{t("p75", { amount: fmt(data.p75, data.currency, numberLocale) })}</span>
            </div>
            <div className="h-2 rounded-full bg-muted relative overflow-visible">
              {/* Filled bar from p25 to p75 */}
              <div className={`absolute inset-y-0 left-0 right-0 rounded-full ${cfg?.bar ?? "bg-muted-foreground"} opacity-30`} />
              {/* Median marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/40 rounded-full"
                style={{ left: "50%" }}
              />
              {/* Employer range marker */}
              {markerPct !== null && (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm ${cfg?.bar ?? "bg-primary"}`}
                  style={{ left: `${markerPct}%`, transform: "translate(-50%, -50%)" }}
                  title={t("midpointTitle", { amount: fmt(employerMid!, data.currency, numberLocale) })}
                />
              )}
            </div>
            {markerPct !== null && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {t("midpoint")}{" "}
                <span className={`font-semibold ${cfg?.color ?? ""}`}>
                  {fmt(employerMid!, data.currency, numberLocale)}
                </span>{" "}
                {data.competitiveness === "below" && t("belowInsight")}
                {data.competitiveness === "competitive" && t("competitiveInsight")}
                {data.competitiveness === "above" && t("aboveInsight")}
              </p>
            )}
          </div>

          {/* Insight */}
          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-current/10 pt-2">
            {data.insight}
          </p>

          {/* Adjust button */}
          {onAdjust && data.competitiveness !== "competitive" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2.5"
              onClick={() => {
                // Suggest a range: p25 to median for "below", median to p75 for "above"
                const suggestedMin = data.competitiveness === "below" ? data.p25 : data.median;
                const suggestedMax = data.competitiveness === "below" ? data.median : data.p75;
                onAdjust(suggestedMin, suggestedMax);
              }}
            >
              {t("adjust", {
                min: fmt(
                  data.competitiveness === "below" ? data.p25 : data.median,
                  data.currency,
                  numberLocale
                ),
                max: fmt(
                  data.competitiveness === "below" ? data.median : data.p75,
                  data.currency,
                  numberLocale
                ),
              })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
