"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";

const FIELDS: CrudField[] = [
  { name: "name", label: "Name (English)", type: "text", required: true, placeholder: "John Doe" },
  { name: "nameAr", label: "Name (Arabic)", type: "text", placeholder: "الاسم بالعربية" },
  { name: "designation", label: "Designation (English)", type: "text", placeholder: "Senior Developer" },
  { name: "designationAr", label: "Designation (Arabic)", type: "text", placeholder: "المنصب بالعربية" },
  { name: "company", label: "Company (English)", type: "text", placeholder: "Acme Corp" },
  { name: "companyAr", label: "Company (Arabic)", type: "text", placeholder: "اسم الشركة" },
  { name: "quote", label: "Testimonial (English)", type: "textarea", required: true, placeholder: "What they said..." },
  { name: "quoteAr", label: "Testimonial (Arabic)", type: "textarea", placeholder: "الشهادة بالعربية" },
  { name: "avatar", label: "Avatar URL", type: "text", placeholder: "https://..." },
  {
    name: "rating",
    label: "Rating",
    type: "select",
    options: [
      { value: "5", label: "⭐⭐⭐⭐⭐ (5)" },
      { value: "4", label: "⭐⭐⭐⭐ (4)" },
      { value: "3", label: "⭐⭐⭐ (3)" },
      { value: "2", label: "⭐⭐ (2)" },
      { value: "1", label: "⭐ (1)" },
    ],
  },
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
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  {
    key: "rating",
    label: "Rating",
    render: (value: unknown) => "⭐".repeat(Number(value) || 5),
  },
  { key: "sortOrder", label: "Order" },
  { key: "isActive", label: "Status" },
];

export default function TestimonialsAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/testimonials"
      title="Testimonials"
      description="Manage customer testimonials for the landing page"
      columns={COLUMNS}
      fields={FIELDS}
    />
  );
}
