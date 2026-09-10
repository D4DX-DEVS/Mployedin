import { redirect } from "next/navigation";

/**
 * There is one New Lead form, and it is the dialog on the pipeline page.
 *
 * This route used to host a second, hand-rolled form with a different field
 * set: no expected revenue, no exhibition, and no duplicate check. Because the
 * lead score counts expected revenue, the same company captured here scored
 * lower than one captured in the dialog, and a lead taken at an exhibition
 * could never be attributed to it. Rather than keep two forms in step, this
 * forwards to the dialog — the Create menu, the palette and any old bookmark
 * all land on the same form.
 */
export default async function NewLeadRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/agent/leads?new=1`);
}
