"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { Badge } from "@/components/ui/badge";
import { Newspaper } from "lucide-react";

const FIELDS: CrudField[] = [
  { name: "title", label: "Title (English)", type: "text", required: true, placeholder: "Blog post title" },
  { name: "titleAr", label: "Title (Arabic)", type: "text", placeholder: "عنوان المقال" },
  { name: "slug", label: "Slug", type: "text", placeholder: "auto-generated from title if empty" },
  { name: "excerpt", label: "Excerpt (English)", type: "textarea", placeholder: "Short summary..." },
  { name: "excerptAr", label: "Excerpt (Arabic)", type: "textarea", placeholder: "ملخص قصير..." },
  { name: "body", label: "Body (English)", type: "textarea", required: true, placeholder: "Full blog content (supports HTML)" },
  { name: "bodyAr", label: "Body (Arabic)", type: "textarea", placeholder: "محتوى المقال بالعربية" },
  { name: "coverImage", label: "Cover Image URL", type: "text", placeholder: "https://..." },
  { name: "author", label: "Author", type: "text", placeholder: "Author name" },
  { name: "tags", label: "Tags (comma-separated)", type: "text", placeholder: "recruitment, career, tips" },
  {
    name: "status",
    label: "Publish Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
    ],
  },
  {
    name: "isActive",
    label: "Active",
    type: "select",
    options: [
      { value: "true", label: "Active" },
      { value: "false", label: "Inactive" },
    ],
  },
];

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  {
    key: "status",
    label: "Publish",
    render: (value: unknown) => (
      <Badge variant={value === "published" ? "default" : "secondary"}>
        {String(value)}
      </Badge>
    ),
  },
  { key: "isActive", label: "Active" },
  {
    key: "publishedAt",
    label: "Published At",
    render: (value: unknown) =>
      value ? new Date(String(value)).toLocaleDateString() : "—",
  },
];

export default function BlogsAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/blogs"
      title="Blog Posts"
      description="Manage blog articles for the public website"
      columns={COLUMNS}
      fields={FIELDS}
      icon={Newspaper}
      iconColor="text-emerald-600"
      filterFields={[
        { type: "search", placeholder: "Search title, slug, author, or tags…" },
        {
          type: "status",
          label: "Publish / visibility",
          options: [
            { value: "all", label: "All" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
      ]}
    />
  );
}
