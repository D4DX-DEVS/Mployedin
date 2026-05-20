"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { FileText } from "lucide-react";

const FIELDS: CrudField[] = [
  { name: "slug", label: "Slug", type: "text", required: true, placeholder: "e.g. privacy-policy, terms-and-conditions, cookie-policy, gdpr" },
  { name: "title", label: "Title (English)", type: "text", required: true, placeholder: "Privacy Policy" },
  { name: "titleAr", label: "Title (Arabic)", type: "text", placeholder: "سياسة الخصوصية" },
  { name: "body", label: "Body (English - HTML)", type: "textarea", required: true, placeholder: "<h2>Privacy Policy</h2><p>...</p>" },
  { name: "bodyAr", label: "Body (Arabic - HTML)", type: "textarea", placeholder: "المحتوى بالعربية" },
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
  { key: "slug", label: "Slug" },
  { key: "title", label: "Title" },
  {
    key: "updatedAt",
    label: "Last Updated",
    render: (value: unknown) =>
      value ? new Date(String(value)).toLocaleDateString() : "—",
  },
  { key: "isActive", label: "Status" },
];

export default function StaticPagesAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/static-pages"
      title="Static Pages"
      description="Manage Privacy Policy, Terms & Conditions, Cookie Policy, GDPR and other static pages"
      columns={COLUMNS}
      fields={FIELDS}
      icon={FileText}
      iconColor="text-cyan-600"
      editPageBasePath="/admin/cms/static-pages"
      createPagePath="/admin/cms/static-pages/new"
      filterFields={[
        { type: "search", placeholder: "Search slug, title…" },
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
