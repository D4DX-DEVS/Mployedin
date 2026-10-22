import { getTranslations } from "next-intl/server";
import CookieConsent from "./CookieConsent";
import StorageSweep from "./StorageSweep";
import { getConsent } from "@/lib/consent/server";
import { BANNER_COPY_KEYS, SETTINGS_COPY_KEYS, itemCopyKey, purposeKeys } from "@/lib/consent/copy";

/**
 * The cookie banner and Cookie settings dialog for any route group. Public
 * pages, sign-up and sign-in, onboarding and the dashboards all mount it, so a
 * visitor who lands straight on /register (a referral link) or a staff-created
 * user who never saw the public site still answers it, and every
 * CookieSettingsLink has a dialog to open.
 *
 * Labels are translated here, on the server, so no group has to ship the
 * `landing` / `consent` namespaces to the client. The keys come from
 * lib/consent/copy, the same list the receipt route hashes, so the hash always
 * covers what was shown. The stored choice is read here too, so a visitor
 * without one gets the banner in the first paint.
 *
 * It also mounts StorageSweep, which removes Firebase's leftover IndexedDB
 * databases once per page load. This is the one component every route group
 * already renders, so the sweep needs no layout of its own.
 */
export async function CookieConsentMount({ locale }: { locale: string }) {
  const [t, consent] = await Promise.all([getTranslations({ locale }), getConsent()]);
  const translate = <K extends string>(keys: Record<K, string>) =>
    Object.fromEntries(Object.entries<string>(keys).map(([name, key]) => [name, t(key)])) as Record<K, string>;

  return (
    <>
      <StorageSweep />
      <CookieConsent
        locale={locale}
        initiallyVisible={consent === null}
        labels={{
          ...translate(BANNER_COPY_KEYS),
          settings: translate(SETTINGS_COPY_KEYS),
          items: Object.fromEntries(purposeKeys().map((key) => [key, t(itemCopyKey(key))])),
          newTab: t("common.opensInNewTab"),
        }}
      />
    </>
  );
}
