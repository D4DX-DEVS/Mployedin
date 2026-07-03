"use client";

import { useTranslations } from "next-intl";
import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { Video } from "lucide-react";

export default function VideosAdminPage() {
  const t = useTranslations("adminCmsVideos");

  const FIELDS: CrudField[] = [
    { name: "title", label: t("titleEnglishLabel"), type: "text", required: true, placeholder: t("videoTitlePlaceholder") },
    { name: "titleAr", label: t("titleArabicLabel"), type: "text", placeholder: t("videoTitlePlaceholder") },
    { name: "description", label: t("descriptionEnglishLabel"), type: "textarea", placeholder: t("briefDescriptionPlaceholder") },
    { name: "descriptionAr", label: t("descriptionArabicLabel"), type: "textarea", placeholder: t("briefDescriptionPlaceholder") },
    { name: "url", label: t("videoUrlLabel"), type: "text", required: true, placeholder: t("youtubeUrlPlaceholder") },
    { name: "thumbnail", label: t("thumbnailUrlLabel"), type: "text", placeholder: t("httpPlaceholder") },
    { name: "sortOrder", label: t("sortOrderLabel"), type: "number", placeholder: "0" },
    {
      name: "isActive",
      label: t("statusLabel"),
      type: "select",
      options: [
        { value: "true", label: t("activeLabel") },
        { value: "false", label: t("inactiveLabel") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "title", label: t("columnTitleLabel") },
    {
      key: "url",
      label: t("columnUrlLabel"),
      render: (value: unknown) => (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
          {String(value).substring(0, 40)}...
        </a>
      ),
    },
    { key: "sortOrder", label: t("columnOrderLabel") },
    { key: "isActive", label: t("statusLabel") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/videos"
      title={t("pageTitle")}
      description={t("pageDescription")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={Video}
      iconColor="text-red-600"
      filterFields={[
        { type: "search", placeholder: t("searchPlaceholder") },
        {
          type: "status",
          label: t("visibilityFilterLabel"),
          options: [
            { value: "all", label: t("allStatusesLabel") },
            { value: "active", label: t("activeStatusLabel") },
            { value: "inactive", label: t("inactiveStatusLabel") },
          ],
        },
      ]}
    />
  );
}
