"use client";

import CmsPage from "@/components/features/admin/CmsPage";
import type { CrudField } from "@/components/shared/CrudModal";
import { HelpCircle } from "lucide-react";

const FIELDS: CrudField[] = [
  { name: "question", label: "Question (English)", type: "textarea", required: true, placeholder: "e.g. How do I register?" },
  { name: "questionAr", label: "Question (Arabic)", type: "textarea", placeholder: "السؤال بالعربية" },
  { name: "answer", label: "Answer (English)", type: "textarea", required: true, placeholder: "The detailed answer..." },
  { name: "answerAr", label: "Answer (Arabic)", type: "textarea", placeholder: "الجواب بالعربية" },
  { name: "category", label: "Category", type: "text", placeholder: "general" },
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
  { key: "question", label: "Question" },
  { key: "category", label: "Category" },
  { key: "sortOrder", label: "Order" },
  { key: "isActive", label: "Status" },
];

export default function FaqsAdminPage() {
  return (
    <CmsPage
      apiUrl="/api/admin/cms/faqs"
      title="FAQs"
      description="Manage frequently asked questions for the landing page"
      columns={COLUMNS}
      fields={FIELDS}
      icon={HelpCircle}
      iconColor="text-blue-600"
      filterFields={[
        { type: "search", placeholder: "Search question, answer, or category…" },
        {
          type: "status",
          label: "Visibility",
          options: [
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
        {
          type: "text",
          key: "category",
          label: "Category",
          placeholder: "e.g. general, billing, jobs",
          param: "category",
        },
      ]}
    />
  );
}
