"use client";

import { useId, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CityPicker, type PickedCity } from "@/components/shared/CityPicker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FALLBACK_PHONE_COUNTRIES } from "@/lib/phone/countries";

/**
 * Where a job seeker lives: a country, then a catalogue city in it (client
 * report 2026-09-30, #5). The city's id is what agents' areas match on, so it
 * is picked from the list rather than typed. Strings come from `common`, which
 * both the onboarding and dashboard route groups ship.
 */

export interface SeekerAreaValue {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  city: PickedCity | null;
}

interface SeekerAreaFieldProps {
  value: SeekerAreaValue;
  onChange: (value: SeekerAreaValue) => void;
  error?: string;
  /** Hide the "who sees this" line when the caller already explains it. */
  showHint?: boolean;
  /** Inside a Dialog: portal the lists into it (SearchableSelect). */
  container?: HTMLElement | null;
  modal?: boolean;
}

/** Display name of a country code in the viewer's language. */
export function areaCountryName(code: string, locale: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale === "ar" ? "ar" : "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function SeekerAreaField({ value, onChange, error, showHint = true, container, modal }: SeekerAreaFieldProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const countryId = `seeker-area-country-${useId()}`;

  const countryOptions = useMemo(
    () => FALLBACK_PHONE_COUNTRIES.map((c) => ({
      value: c.code,
      label: locale === "ar" ? c.nameAr ?? c.name : c.name,
    })),
    [locale],
  );

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={countryId} className="block text-xs font-medium text-muted-foreground">
            {t("seekerArea.country")}
          </label>
          <SearchableSelect
            id={countryId}
            ariaLabel={t("seekerArea.country")}
            options={countryOptions}
            value={value.countryCode}
            // A city belongs to one country: changing it clears the pick.
            onValueChange={(code) => onChange(code === value.countryCode ? value : { countryCode: code, city: null })}
            placeholder={t("seekerArea.countryPlaceholder")}
            searchPlaceholder={t("seekerArea.countrySearch")}
            emptyMessage={t("seekerArea.countryNoMatch")}
            container={container}
            modal={modal}
          />
        </div>
        <CityPicker
          countryCode={value.countryCode}
          value={value.city}
          onChange={(city) => onChange({ ...value, city })}
          label={t("seekerArea.city")}
          placeholder={t("seekerArea.cityPlaceholder")}
          searchPlaceholder={t("seekerArea.citySearch")}
          typeToSearchMessage={t("seekerArea.cityTypeToSearch")}
          emptyMessage={t("seekerArea.cityNoMatch")}
          loadingMessage={t("seekerArea.citySearching")}
          error={error}
          container={container}
          modal={modal}
        />
      </div>
      {showHint && <p className="text-xs text-muted-foreground">{t("seekerArea.hint")}</p>}
    </div>
  );
}
