"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CityPicker, type PickedCity } from "@/components/shared/CityPicker";
import { RequiredMark } from "@/components/ui/required-mark";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FALLBACK_PHONE_COUNTRIES } from "@/lib/phone/countries";

/**
 * Where a job seeker lives: a country, then a catalogue city in it (client
 * report 2026-09-30, #5). The city's id is what agents' areas match on, so it
 * is picked from the list rather than typed. A seeker whose town isn't listed
 * picks just the region (state) instead (owner, 2026-10-02) — staff who hold
 * the whole region then see them. Strings come from `common`, which both the
 * onboarding and dashboard route groups ship.
 */

/** A catalogue region (state), picked when the seeker's city isn't listed. */
export interface PickedRegion {
  id: string;
  name: string;
}

export interface SeekerAreaValue {
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  city: PickedCity | null;
  /** Only when no city is picked. */
  region: PickedRegion | null;
}

/** Has the seeker said where they live — a city, or at least the region? */
export function hasSeekerArea(value: SeekerAreaValue): boolean {
  return Boolean(value.city || value.region);
}

interface SeekerAreaFieldProps {
  value: SeekerAreaValue;
  onChange: (value: SeekerAreaValue) => void;
  error?: string;
  required?: boolean;
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

interface RegionResult {
  _id: string;
  name: string;
  nameAr?: string;
}

/** A country's regions, loaded when the region list is shown. */
function useRegions(countryCode: string, enabled: boolean) {
  const [regions, setRegions] = useState<RegionResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    // Never offer the last country's regions while (or instead of) loading these.
    setRegions([]);
    if (!enabled || !countryCode) return;
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ level: "states", country: countryCode });
    fetch(`/api/filters/locations?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { states: [] }))
      .then((data: { states?: RegionResult[] }) => setRegions(data.states ?? []))
      .catch(() => { if (!controller.signal.aborted) setRegions([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [countryCode, enabled]);
  return { regions, loading };
}

export function SeekerAreaField({ value, onChange, error, required, showHint = true, container, modal }: SeekerAreaFieldProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const countryId = `seeker-area-country-${useId()}`;
  const regionId = `seeker-area-region-${useId()}`;

  // The region list replaces the city picker when the seeker says their city
  // isn't listed, or when the area already saved is a region.
  const [regionMode, setRegionMode] = useState(Boolean(value.region && !value.city));
  useEffect(() => {
    if (value.region && !value.city) setRegionMode(true);
    else if (value.city) setRegionMode(false);
  }, [value.city, value.region]);
  const { regions, loading } = useRegions(value.countryCode, regionMode);

  const countryOptions = useMemo(
    () => FALLBACK_PHONE_COUNTRIES.map((c) => ({
      value: c.code,
      label: locale === "ar" ? c.nameAr ?? c.name : c.name,
    })),
    [locale],
  );
  const regionOptions = useMemo(() => {
    const list = regions.map((r) => ({ value: r._id, label: locale === "ar" && r.nameAr ? r.nameAr : r.name }));
    // Keep the current pick resolvable on the closed trigger while the list loads.
    if (value.region && !list.some((o) => o.value === value.region?.id)) {
      list.unshift({ value: value.region.id, label: value.region.name });
    }
    return list;
  }, [regions, value.region, locale]);

  const switchMode = (toRegion: boolean) => {
    setRegionMode(toRegion);
    // One or the other is saved: switching drops the pick it replaces.
    onChange({ ...value, city: null, region: null });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={countryId} className="block text-xs font-medium text-muted-foreground">
            {t("seekerArea.country")} {required && <RequiredMark />}
          </label>
          <SearchableSelect
            id={countryId}
            ariaLabel={t("seekerArea.country")}
            ariaRequired={required}
            options={countryOptions}
            value={value.countryCode}
            // A city or region belongs to one country: changing it clears the pick.
            onValueChange={(code) => onChange(code === value.countryCode ? value : { countryCode: code, city: null, region: null })}
            placeholder={t("seekerArea.countryPlaceholder")}
            searchPlaceholder={t("seekerArea.countrySearch")}
            emptyMessage={t("seekerArea.countryNoMatch")}
            container={container}
            modal={modal}
          />
        </div>
        {regionMode ? (
          <div className="space-y-1">
            <label htmlFor={regionId} className="block text-xs font-medium text-muted-foreground">
              {t("seekerArea.region")} {required && <RequiredMark />}
            </label>
            <SearchableSelect
              id={regionId}
              ariaLabel={t("seekerArea.region")}
              ariaRequired={required}
              ariaInvalid={Boolean(error)}
              options={regionOptions}
              value={value.region?.id ?? ""}
              onValueChange={(id) => {
                const picked = regions.find((r) => r._id === id);
                onChange({ ...value, city: null, region: picked ? { id: picked._id, name: picked.name } : null });
              }}
              placeholder={t("seekerArea.regionPlaceholder")}
              searchPlaceholder={t("seekerArea.regionSearch")}
              emptyMessage={t("seekerArea.regionNoMatch")}
              loading={loading}
              loadingMessage={t("seekerArea.citySearching")}
              disabled={!value.countryCode}
              className={error ? "border-destructive" : undefined}
              container={container}
              modal={modal}
            />
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <CityPicker
            countryCode={value.countryCode}
            value={value.city}
            onChange={(city) => onChange({ ...value, city, region: null })}
            label={t("seekerArea.city")}
            placeholder={t("seekerArea.cityPlaceholder")}
            searchPlaceholder={t("seekerArea.citySearch")}
            typeToSearchMessage={t("seekerArea.cityTypeToSearch")}
            emptyMessage={t("seekerArea.cityNoMatch")}
            loadingMessage={t("seekerArea.citySearching")}
            error={error}
            required={required}
            container={container}
            modal={modal}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => switchMode(!regionMode)}
        disabled={!value.countryCode}
        className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
      >
        {regionMode ? t("seekerArea.pickCityInstead") : t("seekerArea.cityNotListed")}
      </button>
      {showHint && (
        <p className="text-xs text-muted-foreground">{regionMode ? t("seekerArea.regionHint") : t("seekerArea.hint")}</p>
      )}
    </div>
  );
}
