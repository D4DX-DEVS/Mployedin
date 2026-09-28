import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

export interface PhoneCountry {
  code: string;
  dialCode: string;
  name: string;
  nameAr?: string;
}

const CORE_PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "AE", dialCode: "+971", name: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة" },
  { code: "SA", dialCode: "+966", name: "Saudi Arabia", nameAr: "المملكة العربية السعودية" },
  { code: "BH", dialCode: "+973", name: "Bahrain", nameAr: "البحرين" },
  { code: "IN", dialCode: "+91", name: "India", nameAr: "الهند" },
  { code: "QA", dialCode: "+974", name: "Qatar", nameAr: "قطر" },
  { code: "OM", dialCode: "+968", name: "Oman", nameAr: "عُمان" },
  { code: "KW", dialCode: "+965", name: "Kuwait", nameAr: "الكويت" },
  { code: "GB", dialCode: "+44", name: "United Kingdom", nameAr: "المملكة المتحدة" },
  { code: "US", dialCode: "+1", name: "United States", nameAr: "الولايات المتحدة" },
  { code: "PK", dialCode: "+92", name: "Pakistan", nameAr: "باكستان" },
  { code: "BD", dialCode: "+880", name: "Bangladesh", nameAr: "بنغلاديش" },
  { code: "EG", dialCode: "+20", name: "Egypt", nameAr: "مصر" },
];

/** A complete metadata-backed list keeps the selector useful before the country
 * collection is seeded. Database entries replace these labels when available. */
const METADATA_PHONE_COUNTRIES: PhoneCountry[] = getCountries().map((code) => {
  const region = code as CountryCode;
  const name = new Intl.DisplayNames(["en"], { type: "region" }).of(region) ?? code;
  const nameAr = new Intl.DisplayNames(["ar"], { type: "region" }).of(region) ?? name;
  return { code, dialCode: `+${getCountryCallingCode(region)}`, name, nameAr };
});

export const FALLBACK_PHONE_COUNTRIES: PhoneCountry[] = [
  ...CORE_PHONE_COUNTRIES,
  ...METADATA_PHONE_COUNTRIES.filter((country) => !CORE_PHONE_COUNTRIES.some((core) => core.code === country.code)),
];

export function normalizeDialCode(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export function flagForCountry(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397));
}
