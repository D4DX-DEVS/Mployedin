import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  const t = await getTranslations("maintenance");

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-md space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wrench className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
        </div>

        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("subtitle")}</p>

        <div className="rounded-lg border border-border bg-card text-sm text-muted-foreground card-pad">
          {t("adminHint")}
        </div>

        <Link
          href={`/${locale}/login`}
          className="inline-block rounded-lg bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium transition-colors hover:bg-primary/90"
        >
          {t("adminSignIn")}
        </Link>
      </div>

      <p className="mt-12 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} MPLOYEDIN
      </p>
    </div>
  );
}
