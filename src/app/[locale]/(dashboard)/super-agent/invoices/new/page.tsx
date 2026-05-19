"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { InvoiceBuilder } from "@/components/features/invoices/InvoiceBuilder";

export default function SuperAgentNewInvoicePage() {
  const router = useRouter();
  const locale = useLocale();

  return (
    <InvoiceBuilder
      open={true}
      onClose={() => router.push(`/${locale}/super-agent/invoices`)}
      onSuccess={() => router.push(`/${locale}/super-agent/invoices`)}
      defaultCurrency="AED"
      searchScope="admin"
      role="super_agent"
      mode="page"
    />
  );
}
