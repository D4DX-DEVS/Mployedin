"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export default function BannersAdminPage() {
  const t = useTranslations("adminCmsBanners");

  const FIELDS: CrudField[] = [
    { name: "title", label: t("titleEnglish"), type: "text", placeholder: t("bannerHeadline") },
    { name: "titleAr", label: t("titleArabic"), type: "text", placeholder: t("bannerHeadlineAr") },
    { name: "subtitle", label: t("subtitleEnglish"), type: "text", placeholder: t("supportingText") },
    { name: "subtitleAr", label: t("subtitleArabic"), type: "text", placeholder: t("supportingTextAr") },
    { name: "image", label: t("imageUrl"), type: "text", required: true, placeholder: "https://..." },
    { name: "imageMobile", label: t("mobileImageUrl"), type: "text", placeholder: "https://... (optional)" },
    { name: "linkUrl", label: t("linkUrl"), type: "text", placeholder: "https://..." },
    { name: "linkText", label: t("linkTextEnglish"), type: "text", placeholder: t("learnMore") },
    { name: "linkTextAr", label: t("linkTextArabic"), type: "text", placeholder: t("learnMoreAr") },
    { name: "sortOrder", label: t("sortOrder"), type: "number", placeholder: "0" },
    {
      name: "isActive",
      label: t("status"),
      type: "select",
      options: [
        { value: "true", label: t("active") },
        { value: "false", label: t("inactive") },
      ],
    },
  ];

  const COLUMNS = [
    { key: "title", label: t("title") },
    {
      key: "image",
      label: t("image"),
      render: (value: unknown) =>
        value ? (
          <img src={String(value)} alt="" className="h-10 w-16 rounded object-cover" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "sortOrder", label: t("order") },
    { key: "isActive", label: t("status") },
  ];

  return (
    <CmsPage
      apiUrl="/api/admin/cms/banners"
      title={t("banners")}
      description={t("manageBanners")}
      columns={COLUMNS}
      fields={FIELDS}
      icon={ImageIcon}
      iconColor="text-orange-600"
      filterFields={[
        { type: "search", placeholder: t("searchBannerTitle") },
        {
          type: "status",
          label: t("visibility"),
          options: [
            { value: "all", label: t("allStatuses") },
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
          ],
        },
      ]}
    />
  );
}
