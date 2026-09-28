"use client";

import { useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { HelpCircle } from "lucide-react";
import { FAQ_CATEGORIES } from "@/lib/cms/faqCategories";
import { useFaqCategoryLabel } from "@/hooks/useFaqCategoryLabel";

export default function FaqsAdminPage() {
  const t = useTranslations("adminCmsFaqs");
  const categoryLabel = useFaqCategoryLabel();
  // Fixed list — free text let "General" and "general" become two public tabs.
  const categoryOptions = FAQ_CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }));

  const FIELDS: CrudField[] = [
    { name: "question", label: t("field.question"), type: "textarea", required: true, placeholder: t("placeholder.questionEn") },
    { name: "questionAr", label: t("field.questionAr"), type: "textarea", placeholder: t("placeholder.questionAr") },
    { name: "answer", label: t("field.answer"), type: "textarea", required: true, placeholder: t("placeholder.answerEn") },
    { name: "answerAr", label: t("field.answerAr"), type: "textarea", placeholder: t("placeholder.answerAr") },
    // Left blank, a new FAQ is filed under General (see faqCreateSchema).
    { name: "category", label: t("field.category"), type: "select", options: categoryOptions, placeholder: categoryLabel("general") },
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
    { key: "question", label: t("column.question"), sortable: true },
    { key: "category", label: t("column.category"), sortable: true, render: (value: unknown) => categoryLabel(String(value ?? "")) },
    { key: "sortOrder", label: t("column.order"), sortable: true },
    { key: "isActive", label: t("column.status") },
  ];

  return (
    <CmsPage
      defaultSort={{ by: "sortOrder", order: "asc" }}
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
          type: "select",
          key: "category",
          label: t("filter.category"),
          options: [{ value: "all", label: t("filter.allCategories") }, ...categoryOptions],
          param: "category",
        },
      ]}
    />
  );
}
