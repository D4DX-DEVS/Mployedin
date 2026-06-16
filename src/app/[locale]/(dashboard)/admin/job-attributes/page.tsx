import { redirect } from "next/navigation";

export default async function AdminJobAttributesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/job-attributes/industries`);
}
