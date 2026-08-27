"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp, DollarSign, MapPin, Briefcase, Search } from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

interface SalaryData {
  salaryOverview: { _id: { currency: string }; avgMin: number; avgMax: number; count: number; minSalary: number; maxSalary: number }[];
  topPayingRoles: { _id: string; avgMin: number; avgMax: number; currency: string; count: number }[];
  byCountry: { _id: string; avgMin: number; avgMax: number; currency: string; count: number }[];
}

export default function SalaryExplorerPage() {
  const t = useTranslations("salaryExplorer");
  const [data, setData] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [searchRole, setSearchRole] = useState("");
  const [searchCountry, setSearchCountry] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchRole) params.set("role", searchRole);
      if (searchCountry) params.set("country", searchCountry);
      const res = await fetch(`/api/salary-explorer?${params}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [searchRole, searchCountry]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchRole(role);
    setSearchCountry(country);
  };

  const fmt = (num: number, currency = "AED") =>
    `${currency} ${formatCount(Math.round(num))}`;

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-8 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={t("jobTitlePlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="relative w-[200px]">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder={t("countryPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button type="submit" className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
          <Search className="w-4 h-4" />
          {t("explore")}
        </button>
      </form>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">{t("loadingData")}</div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground">{t("noDataAvailable")}</div>
      ) : (
        <div className="space-y-8">
          {/* Salary Overview Cards */}
          {data.salaryOverview.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.salaryOverview.map((item) => (
                <div key={item._id.currency} className="bg-card border border-border rounded-xl panel-body">
                  <p className="text-sm text-muted-foreground mb-1">{item._id.currency} {t("jobsCountSuffix", { count: item.count })}</p>
                  <p className="text-xl font-bold text-foreground">
                    {fmt(item.avgMin, item._id.currency)} – {fmt(item.avgMax, item._id.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t("averageMonthlyRange")}</p>
                </div>
              ))}
            </div>
          )}

          {/* Top Paying Roles */}
          {data.topPayingRoles.length > 0 && (
            <div>
              <h2 className="heading-section font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {t("topPayingRoles")}
              </h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("roleHeader")}</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("avgRangeHeader")}</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("jobsHeader")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.topPayingRoles.map((role, i) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{role._id}</td>
                          <td className="px-4 py-3 text-green-600">
                            {fmt(role.avgMin, role.currency)} – {fmt(role.avgMax, role.currency)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{role.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* By Country */}
          {data.byCountry.length > 0 && (
            <div>
              <h2 className="heading-section font-semibold text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {t("countriesSalaries")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.byCountry.map((item, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl hover:border-primary/30 transition-colors card-pad">
                    <p className="font-medium text-foreground">{item._id}</p>
                    <p className="text-sm text-green-600 mt-1">
                      {fmt(item.avgMin, item.currency)} – {fmt(item.avgMax, item.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("jobsCount", { count: item.count })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
