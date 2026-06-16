import { redirect } from "next/navigation";

export default async function AdminLocationDataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/location-data/countries`);
}
