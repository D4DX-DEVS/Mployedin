import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/**
 * 404 for the public site. Lives inside the (public) group so a missing job,
 * blog post or page keeps the site header and footer (JS-1 / JS-22) instead of
 * falling through to the bare root not-found screen.
 */
export default async function PublicNotFound() {
  const t = await getTranslations("publicNotFound");
  const locale = await getLocale();

  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-5xl font-bold tracking-tight text-muted-foreground" aria-hidden="true">404</p>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild>
            <Link href={`/${locale}/jobs`}>{t("browseJobs")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${locale}`}>{t("home")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
