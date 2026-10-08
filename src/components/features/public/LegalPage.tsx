import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar, Building2, Mail, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connectDB } from "@/lib/db/mongoose";
import StaticPage from "@/models/StaticPage";
import { sanitizeHtml } from "@/lib/security/html";
import logger from "@/lib/logger";

/** `landing.*` message keys for one legal page. */
export interface LegalPageKeys {
  heading: string;
  subheading?: string;
  lastUpdated: string;
  intro: string;
  preparing: string;
  agreement: string;
}

/**
 * The CMS body for a system page, or "" when the slug is missing, inactive or
 * the database is unreachable — the page then still renders its heading,
 * intro and contact details instead of a blank screen (CM-2).
 */
async function loadBody(slug: string, isAr: boolean): Promise<string> {
  try {
    await connectDB();
    const page = (await StaticPage.findOne({ slug, isActive: true }).lean()) as
      | { body?: string; bodyAr?: string }
      | null;
    if (!page) return "";
    return (isAr ? page.bodyAr || page.body : page.body) ?? "";
  } catch (error) {
    logger.error({ error, slug }, "[Public] Legal page load failed");
    return "";
  }
}

/**
 * Server-rendered privacy / terms / cookies / GDPR page (JS-3, CM-2). These
 * were client components that fetched the CMS body after hydration, so the
 * first paint had no h1 and no content.
 */
export async function LegalPage({
  locale,
  slug,
  icon: Icon,
  keys,
  children,
}: {
  locale: string;
  slug: string;
  icon: LucideIcon;
  keys: LegalPageKeys;
  /** Structured content rendered between the intro and the CMS body. */
  children?: ReactNode;
}) {
  const isAr = locale === "ar";
  const t = await getTranslations("landing");
  const body = await loadBody(slug, isAr);

  return (
    <div className="bg-muted/30 min-h-[80vh] py-14">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Icon className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{t(keys.heading)}</h1>
          {keys.subheading ? (
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">{t(keys.subheading)}</p>
          ) : null}
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" aria-hidden />
            <span>{t(keys.lastUpdated)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
          <div className="border-b border-border/60 bg-muted/40 px-6 py-5 rounded-t-2xl sm:px-8">
            <p className="text-sm leading-relaxed text-muted-foreground text-justify">{t(keys.intro)}</p>
          </div>

          {children ? <div className="border-b border-border/60 px-6 py-6 sm:px-8">{children}</div> : null}

          {body ? (
            <div
              className="prose prose-neutral max-w-none px-6 py-8 sm:px-8 prose-headings:scroll-mt-20 prose-h2:text-xl prose-h2:font-semibold prose-h2:border-b prose-h2:border-border/40 prose-h2:pb-3 prose-h2:mb-4 prose-h3:text-lg prose-p:text-justify prose-p:leading-7 prose-li:leading-7"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
            />
          ) : (
            <p className="px-6 py-10 text-center text-muted-foreground sm:px-8">{t(keys.preparing)}</p>
          )}

          <div className="border-t border-border/60 bg-muted/40 px-6 py-6 rounded-b-2xl sm:px-8">
            <h2 className="heading-label font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              {t("contactUs")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sm text-foreground leading-5">MPLOYEDIN UK LTD</span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sm text-foreground leading-5">X2 Greenleaf Walk, Southall, UB1 1FR</span>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <a href="mailto:support@mployedin.com" className="text-sm text-primary hover:underline">
                  support@mployedin.com
                </a>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">{t(keys.agreement)}</p>
      </div>
    </div>
  );
}
