"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { InvoiceBuilder } from "@/components/features/invoices/InvoiceBuilder";

export default function AdminNewInvoicePage() {
  const router = useRouter();
  const locale = useLocale();

  return (
    <InvoiceBuilder
      open={true}
      onClose={() => router.push(`/${locale}/admin/invoices`)}
      onSuccess={() => router.push(`/${locale}/admin/invoices`)}
      defaultCurrency="INR"
      searchScope="admin"
      role="admin"
      mode="page"
    />
  );
}
