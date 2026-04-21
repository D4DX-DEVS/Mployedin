"use client";

import { useState, useEffect } from "react";
import { Globe, DollarSign, Save, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  COUNTRY_CURRENCIES,
  SUPPORTED_CURRENCIES,
  currencyForCountry,
} from "@/lib/currency";

const COUNTRIES = Object.entries(COUNTRY_CURRENCIES).map(([code, info]) => ({
  code,
  label: `${code} — ${info.label} (${info.code})`,
}));

export default function AgentSettingsPage() {
  const [country, setCountry] = useState("");
  const [currencyCode, setCurrencyCode] = useState("AED");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/agent/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          setCountry(data.settings.country ?? "");
          setCurrencyCode(data.settings.currencyCode ?? "AED");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setCountry(newCountry);
    if (newCountry) {
      const info = currencyForCountry(newCountry);
      setCurrencyCode(info.code);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, currencyCode }),
      });
      if (res.ok) {
        setMessage("Settings saved successfully");
        setTimeout(() => setMessage(""), 3000);
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to save");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container agent-legacy-surface space-y-6">
        <div className="h-48 animate-pulse rounded-[28px] border border-border/70 bg-card/90" />
        <div className="h-64 animate-pulse rounded-[28px] border border-border/70 bg-card/90" />
      </div>
    );
  }

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Agent workspace
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
            Settings
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Configure your regional preferences including country and currency. These settings determine how monetary values are displayed across your agent workspace.
          </p>
        </div>
      </section>

      {/* Country & Currency */}
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Region</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Country & Currency</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select your operating country to automatically set the display currency, or manually choose any supported currency.</p>
        </div>

        <div className="mt-5 space-y-6 rounded-2xl border border-border/70 bg-secondary/50 p-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Country
              </Label>
              <select
                id="country"
                value={country}
                onChange={handleCountryChange}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                <option value="">Select a country</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Selecting a country auto-fills the currency used in that region.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Display Currency
              </Label>
              <select
                id="currency"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background/85 px-3 text-sm text-foreground shadow-none focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} — {c.code} ({c.label})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                This currency will be used to display commissions and all monetary values.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="h-11 rounded-xl px-5">
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
            {message && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Preview */}
      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Preview</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Currency Display Preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">See how monetary values will appear across your workspace with the selected currency.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[12500, 85000, 250000].map((amount) => {
            const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
            const symbol = info?.symbol ?? currencyCode;
            return (
              <div key={amount} className="workspace-subtle-surface rounded-2xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sample amount</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  {symbol} {amount.toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
