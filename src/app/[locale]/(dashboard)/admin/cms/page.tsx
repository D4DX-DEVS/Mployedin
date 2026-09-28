import { redirect } from "next/navigation";

/**
 * The CMS Overview only repeated the drawer: seven count cards linking to the
 * same seven pages, plus a "total records" that added FAQs to inbox messages.
 * The drawer is the overview now; this route sends old links to the first
 * section.
 */
export default async function AdminCmsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/cms/faqs`);
}
