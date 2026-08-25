"use client";

import { useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { Badge } from "@/components/ui/badge";
import { Newspaper } from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";

export default function BlogsAdminPage() {
  const t = useTranslations("adminCmsBlogs");

  const FIELDS: CrudField[] = [
    { name: "title", label: t("titleFieldLabel"), type: "text", required: true, placeholder: t("titleFieldPlaceholder") },
    { name: "titleAr", label: t("titleArFieldLabel"), type: "text", placeholder: t("titleArFieldPlaceholder") },
    { name: "slug", label: t("slugFieldLabel"), type: "text", placeholder: t("slugFieldPlaceholder") },
    { name: "excerpt", label: t("excerptFieldLabel"), type: "textarea", placeholder: t("excerptFieldPlaceholder") },
    { name: "excerptAr", label: t("excerptArFieldLabel"), type: "textarea", placeholder: t("excerptArFieldPlaceholder") },
    { name: "body", label: t("bodyFieldLabel"), type: "textarea", required: true, placeholder: t("bodyFieldPlaceholder") },
    { name: "bodyAr", label: t("bodyArFieldLabel"), type: "textarea", placeholder: t("bodyArFieldPlaceholder") },
    { name: "coverImage", label: t("coverImageFieldLabel"), type: "text", placeholder: t("coverImageFieldPlaceholder") },
    { name: "author", label: t("authorFieldLabel"), type: "text", placeholder: t("authorFieldPlaceholder") },
    { name: "tags", label: t("tagsFieldLabel"), type: "text", placeholder: t("tagsFieldPlaceholder") },
    {
      name: "status",
      label: t("statusFieldLabel"),
      type: "select",
      options: [
        { value: "draft", label: t("statusDraftOption") },
        { value: "published", label: t("statusPublishedOption") },
      ],
    },
    {
      name: "isActive",
      label: t("isActiveFieldLabel"),
      type: "select",
      options: [
        { value: "true", label: t("isActiveActiveOption") },
        { value: "false", label: t("isActiveInactiveOption") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "title", label: t("titleColumnLabel") },
    { key: "author", label: t("authorColumnLabel") },
    {
      key: "status",
      label: t("publishColumnLabel"),
      render: (value: unknown) => (
        <Badge variant={value === "published" ? "default" : "secondary"}>
          {String(value)}
        </Badge>
      ),
    },
    { key: "isActive", label: t("activeColumnLabel") },
    {
      key: "publishedAt",
      label: t("publishedAtColumnLabel"),
      render: (value: unknown) =>
        value ? formatDate(new Date(String(value))) : "—",
    },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/blogs"
      title={t("pageTitle")}
      description={t("pageDescription")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={Newspaper}
      iconColor="text-emerald-600"
      filterFields={[
        { type: "search", placeholder: t("searchPlaceholder") },
        {
          type: "status",
          label: t("filterStatusLabel"),
          options: [
            { value: "all", label: t("filterStatusAllOption") },
            { value: "published", label: t("filterStatusPublishedOption") },
            { value: "draft", label: t("filterStatusDraftOption") },
            { value: "active", label: t("filterStatusActiveOption") },
            { value: "inactive", label: t("filterStatusInactiveOption") },
          ],
        },
      ]}
    />
  );
}
