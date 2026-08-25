"use client";

import { useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";

export default function StaticPagesAdminPage() {
  const t = useTranslations("adminCmsStaticPages");

  const FIELDS: CrudField[] = [
    { name: "slug", label: t("slugLabel"), type: "text", required: true, placeholder: "e.g. privacy-policy, terms-and-conditions, cookie-policy, gdpr" },
    { name: "title", label: t("titleEnLabel"), type: "text", required: true, placeholder: "Privacy Policy" },
    { name: "titleAr", label: t("titleArLabel"), type: "text", placeholder: "سياسة الخصوصية" },
    { name: "body", label: t("bodyEnLabel"), type: "textarea", required: true, placeholder: "<h2>Privacy Policy</h2><p>...</p>" },
    { name: "bodyAr", label: t("bodyArLabel"), type: "textarea", placeholder: "المحتوى بالعربية" },
    {
      name: "isActive",
      label: t("statusLabel"),
      type: "select",
      options: [
        { value: "true", label: t("statusActiveOption") },
        { value: "false", label: t("statusInactiveOption") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "slug", label: t("slugLabel") },
    { key: "title", label: t("titleColumnLabel") },
    {
      key: "updatedAt",
      label: t("lastUpdatedColumnLabel"),
      render: (value: unknown) =>
        value ? formatDate(new Date(String(value))) : t("emptyDateValue"),
    },
    { key: "isActive", label: t("statusLabel") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/static-pages"
      title={t("pageTitle")}
      description={t("pageDescription")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={FileText}
      iconColor="text-cyan-600"
      editPageBasePath="/admin/cms/static-pages"
      createPagePath="/admin/cms/static-pages/new"
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
