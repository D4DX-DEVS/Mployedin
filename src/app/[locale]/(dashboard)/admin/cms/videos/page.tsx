"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";

const FIELDS: CrudField[] = [
  { name: "title", label: "Title (English)", type: "text", required: true, placeholder: "Video title" },
  { name: "titleAr", label: "Title (Arabic)", type: "text", placeholder: "عنوان الفيديو" },
  { name: "description", label: "Description (English)", type: "textarea", placeholder: "Brief description" },
  { name: "descriptionAr", label: "Description (Arabic)", type: "textarea", placeholder: "وصف مختصر" },
  { name: "url", label: "Video URL (YouTube/Vimeo)", type: "text", required: true, placeholder: "https://youtube.com/watch?v=..." },
  { name: "thumbnail", label: "Thumbnail URL", type: "text", placeholder: "https://..." },
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
    key: "url",
    label: "URL",
    render: (value: unknown) => (
      <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[200px] block">
        {String(value).substring(0, 40)}...
      </a>
    ),
  },
  { key: "sortOrder", label: "Order" },
  { key: "isActive", label: "Status" },
];

export default function VideosAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/videos"
      title="Videos"
      description="Manage videos displayed on the landing page"
      columns={COLUMNS}
      fields={FIELDS}
    />
  );
}
