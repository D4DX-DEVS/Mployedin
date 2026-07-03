"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { Quote } from "lucide-react";
import { useTranslations } from "next-intl";

export default function TestimonialsAdminPage() {
  const t = useTranslations("adminCmsTestimonials");

  const FIELDS: CrudField[] = [
    { name: "name", label: t("fieldLabelNameEnglish"), type: "text", required: true, placeholder: t("fieldPlaceholderName") },
    { name: "nameAr", label: t("fieldLabelNameArabic"), type: "text", placeholder: "الاسم بالعربية" },
    { name: "designation", label: t("fieldLabelDesignationEnglish"), type: "text", placeholder: t("fieldPlaceholderDesignation") },
    { name: "designationAr", label: t("fieldLabelDesignationArabic"), type: "text", placeholder: "المنصب بالعربية" },
    { name: "company", label: t("fieldLabelCompanyEnglish"), type: "text", placeholder: t("fieldPlaceholderCompany") },
    { name: "companyAr", label: t("fieldLabelCompanyArabic"), type: "text", placeholder: "اسم الشركة" },
    { name: "quote", label: t("fieldLabelTestimonialEnglish"), type: "textarea", required: true, placeholder: t("fieldPlaceholderTestimonial") },
    { name: "quoteAr", label: t("fieldLabelTestimonialArabic"), type: "textarea", placeholder: "الشهادة بالعربية" },
    { name: "avatar", label: t("fieldLabelAvatarUrl"), type: "text", placeholder: t("fieldPlaceholderUrl") },
    {
      name: "rating",
      label: t("fieldLabelRating"),
      type: "select",
      options: [
        { value: "5", label: t("ratingLabel5") },
        { value: "4", label: t("ratingLabel4") },
        { value: "3", label: t("ratingLabel3") },
        { value: "2", label: t("ratingLabel2") },
        { value: "1", label: t("ratingLabel1") },
      ],
    },
    { name: "sortOrder", label: t("fieldLabelSortOrder"), type: "number", placeholder: "0" },
    {
      name: "isActive",
      label: t("fieldLabelStatus"),
      type: "select",
      options: [
        { value: "true", label: t("statusLabelActive") },
        { value: "false", label: t("statusLabelInactive") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "name", label: t("columnLabelName") },
    { key: "company", label: t("columnLabelCompany") },
    {
      key: "rating",
      label: t("columnLabelRating"),
      render: (value: unknown) => "⭐".repeat(Number(value) || 5),
    },
    { key: "sortOrder", label: t("columnLabelOrder") },
    { key: "isActive", label: t("columnLabelStatus") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/testimonials"
      title={t("pageTitle")}
      description={t("pageDescription")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={Quote}
      iconColor="text-purple-600"
      filterFields={[
        { type: "search", placeholder: t("searchPlaceholder") },
        {
          type: "status",
          label: t("filterLabelVisibility"),
          options: [
            { value: "all", label: t("filterOptionAllStatuses") },
            { value: "active", label: t("filterOptionActive") },
            { value: "inactive", label: t("filterOptionInactive") },
          ],
        },
      ]}
    />
  );
}
