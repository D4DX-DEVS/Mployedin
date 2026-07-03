"use client";

import { useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { HelpCircle } from "lucide-react";

export default function FaqsAdminPage() {
  const t = useTranslations("adminCmsFaqs");

  const FIELDS: CrudField[] = [
    { name: "question", label: t("field.question"), type: "textarea", required: true, placeholder: t("placeholder.questionEn") },
    { name: "questionAr", label: t("field.questionAr"), type: "textarea", placeholder: t("placeholder.questionAr") },
    { name: "answer", label: t("field.answer"), type: "textarea", required: true, placeholder: t("placeholder.answerEn") },
    { name: "answerAr", label: t("field.answerAr"), type: "textarea", placeholder: t("placeholder.answerAr") },
    { name: "category", label: t("field.category"), type: "text", placeholder: t("placeholder.category") },
    { name: "sortOrder", label: t("field.sortOrder"), type: "number", placeholder: t("placeholder.sortOrder") },
    {
      name: "isActive",
      label: t("field.status"),
      type: "select",
      options: [
        { value: "true", label: t("status.active") },
        { value: "false", label: t("status.inactive") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "question", label: t("column.question") },
    { key: "category", label: t("column.category") },
    { key: "sortOrder", label: t("column.order") },
    { key: "isActive", label: t("column.status") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/faqs"
      title={t("title")}
      description={t("description")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={HelpCircle}
      iconColor="text-blue-600"
      filterFields={[
        { type: "search", placeholder: t("filter.searchPlaceholder") },
        {
          type: "status",
          label: t("filter.visibility"),
          options: [
            { value: "all", label: t("filter.allStatuses") },
            { value: "active", label: t("filter.active") },
            { value: "inactive", label: t("filter.inactive") },
          ],
        },
        {
          type: "text",
          key: "category",
          label: t("filter.category"),
          placeholder: t("filter.categoryPlaceholder"),
          param: "category",
        },
      ]}
    />
  );
}
