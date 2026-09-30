import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import { getCurrentTermsVersion, termsPendingFor } from "@/lib/gdpr/termsVersion";
import { safeCallbackPath } from "@/lib/routing/callbackUrl";
import { getDashboardPath } from "@/lib/permissions/matrix";
import { formatDate } from "@/lib/ui/intlFormat";
import type { UserRole } from "@/types/user";
import { AcceptTermsForm, type AcceptTermsState } from "@/components/features/auth/AcceptTermsForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("acceptTerms.title"), robots: { index: false } };
}

/**
 * Where the proxy sends a signed-in user who owes a Terms/Privacy acceptance
 * (session.user.termsPending). Renders every state and never redirects: a
 * server redirect here, disagreeing with the proxy's cookie-based view, is how
 * redirect loops start (see the stale-cookie note in proxy.ts's auth rules).
 */
export default async function AcceptTermsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as { role?: UserRole } | undefined)?.role;

  if (!userId || !role) {
    return <AcceptTermsForm locale={locale} state="signedOut" destination={`/${locale}/login`} />;
  }

  const destination = safeCallbackPath(sp.callbackUrl, locale) ?? getDashboardPath(role, locale);

  await connectDB();
  const [user, current] = await Promise.all([
    User.findById(userId).select("role termsAcceptedVersion").lean<{ role?: string; termsAcceptedVersion?: string } | null>(),
    getCurrentTermsVersion(),
  ]);
  const pending = termsPendingFor(user?.role ?? role, user?.termsAcceptedVersion, current);
  const state: AcceptTermsState = !pending ? "accepted" : user?.termsAcceptedVersion ? "updated" : "first";
  const changedOn = state === "updated" && current ? formatDate(current, { dateStyle: "long" }, locale) : undefined;

  return <AcceptTermsForm locale={locale} state={state} changedOn={changedOn} destination={destination} />;
}
