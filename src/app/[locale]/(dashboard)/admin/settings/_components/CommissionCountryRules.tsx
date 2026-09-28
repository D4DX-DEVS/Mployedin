"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Percent, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface CommissionOverride {
  countryCode: string;
  rate: number;
  label: string;
}

interface CountryOption { value: string; label: string }

interface CommissionCountryRulesProps {
  rules: CommissionOverride[];
  onChange: (rules: CommissionOverride[]) => void;
}

/** Rules without a country, or a country used twice — save refuses both. */
export function commissionRuleProblem(rules: CommissionOverride[]): "missingCountry" | "duplicateCountry" | null {
  if (rules.some((r) => !/^[A-Z]{2}$/.test(r.countryCode))) return "missingCountry";
  if (new Set(rules.map((r) => r.countryCode)).size !== rules.length) return "duplicateCountry";
  return null;
}

/**
 * Country commission rules. Invoices for an employer in a listed country use
 * the rule's rate instead of the agent's and super-agent's own rates. Rules are
 * keyed by ISO code, so the country is picked from the list, never typed.
 */
export function CommissionCountryRules({ rules, onChange }: CommissionCountryRulesProps) {
  const t = useTranslations("adminSettings");
  const ta = useTranslations("a11y");
  const locale = useLocale();
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/countries")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { countries?: Array<{ code?: string; name?: string; nameAr?: string }> } | null) => {
        if (cancelled || !data?.countries) return;
        setCountries(
          data.countries
            .filter((c) => c.code)
            .map((c) => ({
              value: c.code!.toUpperCase(),
              label: (locale === "ar" && c.nameAr ? c.nameAr : c.name) ?? c.code!.toUpperCase(),
            })),
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [locale]);

  const update = (idx: number, patch: Partial<CommissionOverride>) =>
    onChange(rules.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule)));

  // Each row offers the countries no other row has taken, plus its own.
  const optionsFor = (idx: number): CountryOption[] => {
    const taken = new Set(rules.filter((_, i) => i !== idx).map((r) => r.countryCode));
    const own = rules[idx]?.countryCode;
    const list = countries.filter((c) => !taken.has(c.value));
    return own && !list.some((c) => c.value === own) ? [{ value: own, label: own }, ...list] : list;
  };

  return (
    <div className="panel-body space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="heading-section font-semibold text-foreground flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            {t("commissionOverridesTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("commissionOverridesDescription")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...rules, { countryCode: "", rate: 0, label: "" }])}
        >
          <Plus className="h-4 w-4 mr-1" /> {t("addCommissionButton")}
        </Button>
      </div>

      {rules.length > 0 ? (
        <div className="space-y-2">
          <div className="hidden sm:grid sm:grid-cols-[1fr_96px_1fr_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>{t("countryHeader")}</span>
            <span>{t("rateHeader")}</span>
            <span>{t("labelHeader")}</span>
            <span />
          </div>
          {rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_96px_40px] sm:grid-cols-[1fr_96px_1fr_40px] gap-2 items-center">
              <SearchableSelect
                id={`commission-rule-country-${idx}`}
                ariaLabel={t("countryHeader")}
                options={optionsFor(idx)}
                value={rule.countryCode}
                onValueChange={(value) => update(idx, { countryCode: value })}
                placeholder={t("countryPlaceholder")}
              />
              <Input
                aria-label={t("rateHeader")}
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rule.rate}
                onChange={(e) => update(idx, { rate: parseFloat(e.target.value) || 0 })}
              />
              <Input
                aria-label={t("labelHeader")}
                placeholder={t("labelPlaceholder")}
                value={rule.label}
                onChange={(e) => update(idx, { label: e.target.value })}
                className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
              />
              <Button
                aria-label={ta("delete")}
                variant="ghost"
                size="sm"
                className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto text-destructive hover:text-destructive p-1"
                onClick={() => onChange(rules.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="px-1 text-xs text-muted-foreground">{t("commissionOverridesBothRoles")}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">{t("noOverridesMessage")}</p>
      )}
    </div>
  );
}
