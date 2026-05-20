"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { ImageIcon } from "lucide-react";

const FIELDS: CrudField[] = [
  { name: "title", label: "Title (English)", type: "text", placeholder: "Banner headline" },
  { name: "titleAr", label: "Title (Arabic)", type: "text", placeholder: "عنوان البانر" },
  { name: "subtitle", label: "Subtitle (English)", type: "text", placeholder: "Supporting text" },
  { name: "subtitleAr", label: "Subtitle (Arabic)", type: "text", placeholder: "نص فرعي" },
  { name: "image", label: "Image URL", type: "text", required: true, placeholder: "https://..." },
  { name: "imageMobile", label: "Mobile Image URL", type: "text", placeholder: "https://... (optional)" },
  { name: "linkUrl", label: "Link URL", type: "text", placeholder: "https://..." },
  { name: "linkText", label: "Link Text (English)", type: "text", placeholder: "Learn More" },
  { name: "linkTextAr", label: "Link Text (Arabic)", type: "text", placeholder: "اعرف المزيد" },
  { name: "sortOrder", label: "Sort Order", type: "number", placeholder: "0" },
  {
    name: "isActive",
    label: "Status",
    type: "select",
    options: [
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
  },
];

const COLUMNS = [
  { key: "title", label: "Title" },
  {
    key: "image",
    label: "Image",
    render: (value: unknown) =>
      value ? (
        <img src={String(value)} alt="" className="h-10 w-16 rounded object-cover" />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { key: "sortOrder", label: "Order" },
  { key: "isActive", label: "Status" },
];

export default function BannersAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/banners"
      title="Banners"
      description="Manage homepage banner slider images"
      columns={COLUMNS}
      fields={FIELDS}
      icon={ImageIcon}
      iconColor="text-orange-600"
      filterFields={[
        { type: "search", placeholder: "Search banner title…" },
        {
          type: "status",
          label: "Visibility",
          options: [
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]}
    />
  );
}
