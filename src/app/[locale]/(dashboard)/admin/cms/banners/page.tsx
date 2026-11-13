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
    { name: "image", label: t("imageUrl"), type: "text", placeholder: "https://...", hint: t("imageHint") },
    { name: "linkUrl", label: t("linkUrl"), type: "text", placeholder: "https://..." },
    { name: "linkText", label: t("linkTextEnglish"), type: "text", placeholder: t("learnMore") },
    { name: "linkTextAr", label: t("linkTextArabic"), type: "text", placeholder: t("learnMoreAr") },
    {
      name: "placement",
      label: t("placement"),
      type: "multiselect",
      options: [
        { value: "landing-carousel", label: t("landingCarousel") },
        { value: "in-app-announcement", label: t("inAppAnnouncement") },
      ],
    },
    {
      name: "audienceRoles",
      label: t("audienceRoles"),
      type: "multiselect",
      options: [
        { value: "all", label: t("everyone") },
        { value: "admin", label: t("adminsOnly") },
        { value: "super_agent", label: t("superAgentsOnly") },
        { value: "agent", label: t("agentsOnly") },
        { value: "employer", label: t("employersOnly") },
        { value: "job_seeker", label: t("jobSeekersOnly") },
      ],
    },
    { name: "startDate", label: t("startDate"), type: "date" },
    { name: "endDate", label: t("endDate"), type: "date" },
    {
      name: "style",
      label: t("style"),
      type: "select",
      options: [
        { value: "info", label: t("styleInfo") },
        { value: "success", label: t("styleSuccess") },
        { value: "warning", label: t("styleWarning") },
      ],
    },
    {
      name: "dismissible",
      label: t("dismissible"),
      type: "switch",
    },
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
    { key: "title", label: t("title"), sortable: true },
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
    {
      key: "placement",
      label: t("placement"),
      render: (placement: unknown, item: Record<string, unknown>) => {
        const placements = (() => {
          try {
            return (typeof placement === "string" ? JSON.parse(placement) : placement) as string[];
          } catch {
            return (placement as string[]) || ["landing-carousel"];
          }
        })();
        const roles = (() => {
          try {
            const r = item.audienceRoles;
            return (typeof r === "string" ? JSON.parse(r) : r) as string[];
          } catch {
            return (item.audienceRoles as string[]) || ["all"];
          }
        })();

        const now = new Date();
        const startDate = item.startDate ? new Date(item.startDate as string) : null;
        const endDate = item.endDate ? new Date(item.endDate as string) : null;
        let status = "Live";
        if (startDate && startDate > now) {
          status = "Scheduled";
        } else if (endDate && endDate < now) {
          status = "Ended";
        }

        const placementLabel = placements
          .map((p) => t(p === "landing-carousel" ? "landingCarousel" : "inAppAnnouncement"))
          .join(" · ");

        const rolesLabel = roles.includes("all")
          ? t("everyone")
          : roles.map((r) => {
            const roleMap: Record<string, string> = {
              admin: "adminsOnly",
              super_agent: "superAgentsOnly",
              agent: "agentsOnly",
              employer: "employersOnly",
              job_seeker: "jobSeekersOnly",
            };
            return t(roleMap[r] || "");
          }).filter(Boolean).join(", ");

        return (
          <div className="text-sm space-y-1">
            <div className="font-medium">{placementLabel}</div>
            <div className="text-xs text-muted-foreground">
              {rolesLabel}
              {(startDate || endDate) && ` · ${status}`}
            </div>
          </div>
        );
      },
    },
    { key: "sortOrder", label: t("order"), sortable: true },
    { key: "isActive", label: t("status") },
  ];

  return (
    <CmsPage
      defaultSort={{ by: "sortOrder", order: "asc" }}
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
