"use client";

import { useLocale, useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import { FileText } from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";

/**
 * The legal pages (lib/cms/legalPages) — edit only. No Add New: a new slug
 * had no public route. No Delete: nothing could re-create a deleted page. The
 * slug is locked on the edit page. The API creates any page missing from the DB.
 */
export default function StaticPagesAdminPage() {
  const t = useTranslations("adminCmsStaticPages");
  const locale = useLocale();

  const COLUMNS = [
    { key: "slug", label: t("slugLabel"), sortable: true },
    { key: "title", label: t("titleColumnLabel"), sortable: true },
    {
      key: "updatedAt",
      sortable: true,
      label: t("lastUpdatedColumnLabel"),
      render: (value: unknown) =>
        value ? formatListDate(new Date(String(value)), locale) : t("emptyDateValue"),
    },
    { key: "isActive", label: t("statusLabel") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/static-pages"
      title={t("pageTitle")}
      description={t("pageDescription")}
      columns={COLUMNS}
      fields={[]}
      icon={FileText}
      iconColor="text-cyan-600"
      editPageBasePath="/admin/cms/static-pages"
      allowCreate={false}
      allowDelete={false}
      filterFields={[
        { type: "search", placeholder: t("searchFilterPlaceholder") },
        {
          type: "status",
          label: t("visibilityFilterLabel"),
          options: [
            { value: "all", label: t("allStatusesFilterOption") },
            { value: "active", label: t("activeFilterOption") },
            { value: "inactive", label: t("inactiveFilterOption") },
          ],
        },
      ]}
    />
  );
}
