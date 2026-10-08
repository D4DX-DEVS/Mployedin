import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CookieSettingsButton } from "@/components/shared/consent/CookieSettingsButton";

/** Privacy-policy shortcut block: cookie settings and GDPR data rights. */
export async function PrivacyChoices({ locale }: { locale: string }) {
  const t = await getTranslations("consent");
  return (
    <section aria-labelledby="privacy-choices-h" className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 sm:p-5">
      <h2 id="privacy-choices-h" className="text-lg font-semibold text-foreground">{t("privacyChoicesTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("privacyChoicesText")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <CookieSettingsButton className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" />
        <Link
          href={`/${locale}/gdpr`}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          {t("privacyExport")}
        </Link>
      </div>
    </section>
  );
}
