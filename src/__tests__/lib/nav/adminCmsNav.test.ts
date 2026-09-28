import { getNavGroups } from "@/lib/nav/menuConfig";
import { redirect } from "next/navigation";
import AdminCmsIndexPage from "@/app/[locale]/(dashboard)/admin/cms/page";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}));

function cmsEntry() {
  const items = getNavGroups("admin", "en").flatMap((g) => g.items);
  const cms = items.find((item) => item.title === "CMS / Content");
  if (!cms) throw new Error("CMS / Content missing from the admin nav");
  return cms;
}

describe("admin CMS navigation", () => {
  it("has no overview page — the drawer itself is the overview", () => {
    const titles = (cmsEntry().children ?? []).map((c) => c.title);
    expect(titles).not.toContain("CMS Overview");
    expect((cmsEntry().children ?? []).some((c) => c.href === "/en/admin/cms")).toBe(false);
  });

  it("lists Company Reviews beside Testimonials, so moderation is reachable with nothing pending", () => {
    const titles = (cmsEntry().children ?? []).map((c) => c.title);
    expect(titles).toContain("Company Reviews");
    expect(titles.indexOf("Company Reviews")).toBe(titles.indexOf("Testimonials") + 1);
    const reviews = cmsEntry().children?.find((c) => c.title === "Company Reviews");
    expect(reviews?.href).toBe("/en/admin/cms/company-reviews");
  });

  it("opens CMS on its first section", () => {
    expect(cmsEntry().href).toBe("/en/admin/cms/faqs");
  });

  it("redirects old /admin/cms links to FAQs", async () => {
    await AdminCmsIndexPage({ params: Promise.resolve({ locale: "ar" }) });
    expect(redirect).toHaveBeenCalledWith("/ar/admin/cms/faqs");
  });
});
