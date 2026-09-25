import type { getTranslations } from "next-intl/server";

/** The `adminDashboard` server translator, passed down so sections stay synchronous. */
export type DashboardTranslator = Awaited<ReturnType<typeof getTranslations>>;
