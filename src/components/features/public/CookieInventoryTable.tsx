import { getTranslations } from "next-intl/server";
import { COOKIE_INVENTORY, CONSENT_POLICY_VERSION, type ConsentCategory } from "@/lib/consent/config";

const ORDER: ConsentCategory[] = ["necessary", "functional", "analytics", "marketing"];

/**
 * Cookie & storage inventory for the cookie policy, generated from the same
 * config the consent banner uses so the two can never drift apart.
 */
export async function CookieInventoryTable() {
  const t = await getTranslations("consent");
  const rows = [...COOKIE_INVENTORY].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));

  return (
    <section aria-labelledby="cookie-inventory-h" className="mt-6">
      <h2 id="cookie-inventory-h" className="text-lg font-semibold text-foreground">{t("inventoryHeading")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("inventoryIntro")} {t("policyVersion", { version: CONSENT_POLICY_VERSION })}
      </p>
      {/* Focusable so keyboard users can scroll it (WCAG 2.1.1). */}
      <div
        role="region"
        aria-labelledby="cookie-inventory-h"
        // A scroll container must be reachable by keyboard (axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="mt-4 overflow-x-auto rounded-xl border border-border"
      >
        {/* Opt out of ResponsiveTables card mode: it adds aria-expanded to <tr>,
            which is invalid for table rows. A scrolling data table is a
            permitted reflow exception (WCAG 1.4.10). */}
        <table data-mobile-table="scroll" className="w-full min-w-[640px] text-start text-sm">
          <caption className="sr-only">{t("inventoryHeading")}</caption>
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start">{t("table.name")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("table.category")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("table.purpose")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("table.duration")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("table.provider")}</th>
              <th scope="col" className="px-3 py-2 text-start">{t("table.type")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((item) => (
              <tr key={item.name}>
                <th scope="row" className="px-3 py-2 text-start font-mono text-xs font-semibold [overflow-wrap:anywhere]">{item.name}</th>
                <td className="px-3 py-2">{t(`categories.${item.category}.title`)}</td>
                <td className="px-3 py-2">{t(`inventory.${item.purposeKey}`)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t(`inventory.${item.durationKey}`)}</td>
                <td className="px-3 py-2">{item.provider === "first-party" ? t("firstParty") : item.provider}</td>
                <td className="px-3 py-2">{t(`kinds.${item.kind}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
