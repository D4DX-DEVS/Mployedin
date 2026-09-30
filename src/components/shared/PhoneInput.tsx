"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FALLBACK_PHONE_COUNTRIES, flagForCountry, normalizeDialCode, type PhoneCountry } from "@/lib/phone/countries";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js/min";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
  id?: string;
  onBlur?: () => void;
  onValidityChange?: (valid: boolean) => void;
  /** The seeker picked a code (or pasted a number with one). Fires even with no number typed, when `onChange` does not. */
  onCountryChange?: (country: PhoneCountry) => void;
}

function splitStoredValue(value: string, countries: PhoneCountry[], fallback: PhoneCountry) {
  const raw = value.trim();
  if (!raw.startsWith("+")) return { country: fallback, local: raw.replace(/\D/g, "") };
  const country = [...countries]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((candidate) => raw.startsWith(candidate.dialCode)) ?? fallback;
  return { country, local: raw.slice(country.dialCode.length).replace(/\D/g, "") };
}

export function PhoneInput({
  value,
  onChange,
  label,
  required,
  disabled,
  placeholder = "+971 50 123 4567",
  error,
  hint,
  id,
  onBlur,
  onValidityChange,
  onCountryChange,
}: PhoneInputProps) {
  const t = useTranslations("common");
  const translate = (key: "country" | "searchCountry" | "invalidPhoneNumber", fallbackText: string) => {
    const translated = t(key);
    return translated === `common.${key}` ? fallbackText : translated;
  };
  const locale = useLocale();
  const generatedId = useId();
  const inputId = id ?? `phone-input-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [countries, setCountries] = useState<PhoneCountry[]>(FALLBACK_PHONE_COUNTRIES);
  const fallback = countries.find((country) => country.code === "AE") ?? countries[0];
  const initial = useMemo(() => splitStoredValue(value, countries, fallback), [value, countries, fallback]);
  const [selectedCode, setSelectedCode] = useState(initial.country.code);
  const selected = countries.find((country) => country.code === selectedCode) ?? fallback;
  const countryOptions = useMemo(() => countries.map((country) => ({
    value: country.code,
    label: `${flagForCountry(country.code)} ${country.dialCode} ${locale === "ar" ? (country.nameAr || country.name) : country.name}`,
    triggerLabel: `${flagForCountry(country.code)} ${country.dialCode}`,
  })), [countries, locale]);
  // Strip the value's own code, not the picked one's: "+971 " under a new pick
  // otherwise showed "971" in the box.
  const localNumber = value.trim().startsWith("+") ? initial.local : value.replace(/\D/g, "");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let cancelled = false;
    fetch("/api/countries")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { countries?: Array<{ code?: string; name?: string; nameAr?: string; phoneCode?: string }> } | null) => {
        if (cancelled || !payload?.countries?.length) return;
        const remote = payload.countries
          .map((country) => ({
            code: (country.code ?? "").toUpperCase(),
            dialCode: normalizeDialCode(country.phoneCode ?? ""),
            name: country.name ?? country.code ?? "",
            nameAr: country.nameAr,
          }))
          .filter((country) => country.code && country.dialCode);
        if (remote.length) {
          const remoteCodes = new Set(remote.map((country) => country.code));
          setCountries([...remote, ...FALLBACK_PHONE_COUNTRIES.filter((country) => !remoteCodes.has(country.code))]);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Follow the value only when its own dial code changes (a saved number
  // loading in). Re-reading it whenever the pick changed snapped every pick
  // made before typing back to the value's code — UAE — and turned Canada
  // into the US, since both are +1.
  const valueDialCode = value.trim().startsWith("+") ? initial.country.dialCode : "";
  const [syncedDialCode, setSyncedDialCode] = useState(valueDialCode);
  if (valueDialCode !== syncedDialCode) {
    setSyncedDialCode(valueDialCode);
    if (valueDialCode && valueDialCode !== selected.dialCode) setSelectedCode(initial.country.code);
  }

  const validate = () => {
    const valid = (!required && !localNumber) || Boolean(localNumber && selected?.code && isValidPhoneNumber(localNumber, selected.code as CountryCode));
    setInvalid(!valid);
    onValidityChange?.(valid);
    return valid;
  };

  const updateNumber = (next: string) => {
    let effectiveCountry = selected;
    if (next.trim().startsWith("+")) {
      const pasted = splitStoredValue(next, countries, selected);
      effectiveCountry = pasted.country;
      if (pasted.country.code !== selected.code) {
        setSelectedCode(pasted.country.code);
        onCountryChange?.(pasted.country);
      }
      next = pasted.local;
    }
    const digits = next.replace(/\D/g, "");
    setInvalid(false);
    onValidityChange?.((!required && !digits) || Boolean(digits && effectiveCountry?.code && isValidPhoneNumber(digits, effectiveCountry.code as CountryCode)));
    onChange(digits ? `${effectiveCountry.dialCode} ${digits}` : "");
  };

  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={inputId} className="block text-sm font-medium">{label}{required && <span aria-hidden="true" className="ms-1 text-destructive">*</span>}</label>}
      <div className="flex gap-2" dir="ltr">
        <SearchableSelect
          id={`${inputId}-country`}
          options={countryOptions}
          value={selected.code}
          onValueChange={(code) => {
          const next = countries.find((country) => country.code === code) ?? fallback;
          setSelectedCode(next.code);
          onCountryChange?.(next);
          if (localNumber) onChange(`${next.dialCode} ${localNumber}`);
          setInvalid(false);
          onValidityChange?.((!required && !localNumber) || Boolean(localNumber && isValidPhoneNumber(localNumber, next.code as CountryCode)));
          }}
          ariaLabel={translate("country", "Country")}
          searchPlaceholder={translate("searchCountry", "Search countries…")}
          placeholder={translate("country", "Country")}
          searchable
          /* Modal: this field lives in dialogs (Add Employer, Add Lead), whose
             scroll lock swallows every wheel event over a non-modal portalled
             list, so the 200+ countries could only be scrolled by dragging. */
          modal
          disabled={disabled}
          className="h-10 w-[7.5rem] shrink-0 rounded-lg"
        />
        <div className="relative min-w-0 flex-1">
          <Phone aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={inputId}
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={localNumber}
            onChange={(event) => updateNumber(event.target.value)}
            onBlur={() => { validate(); onBlur?.(); }}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : (error || hint) ? hintId : undefined}
            className={`h-10 w-full rounded-lg border bg-background ps-9 pe-3 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? "border-destructive" : ""}`}
          />
        </div>
      </div>
      {invalid && <p id={errorId} className="text-xs text-destructive">{translate("invalidPhoneNumber", "Enter a valid phone number for the selected country.")}</p>}
      {!invalid && (error || hint) && <p id={hintId} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || hint}</p>}
    </div>
  );
}
