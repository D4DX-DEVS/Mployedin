"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, FileText, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";

/**
 * Employer payment setup.
 *
 * EMP-23: this page used to ask the employer for Stripe/Tap API keys and
 * showed the internal integration roadmap. Gateway credentials are a platform
 * (admin) concern, so employers now see a short "coming soon" state that
 * points at what they can act on today: their plan and their invoices.
 */
export default function EmployerPaymentSetupPage() {
  const t = useTranslations("employerPaymentSetup");
  const { locale } = useParams<{ locale: string }>();

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={t("comingSoonSubtitle")} />

      <section className="workspace-panel-surface rounded-3xl panel-body">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2">
            <CreditCard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="heading-section font-semibold text-foreground">{t("comingSoonTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("comingSoonBody")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/${locale}/employer/subscription`}>
                  <Crown className="me-1 h-4 w-4" aria-hidden="true" />
                  {t("viewPlan")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/${locale}/employer/invoices`}>
                  <FileText className="me-1 h-4 w-4" aria-hidden="true" />
                  {t("viewInvoices")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
