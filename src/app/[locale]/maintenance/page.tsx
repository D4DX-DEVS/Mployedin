import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
            />
          </svg>
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
