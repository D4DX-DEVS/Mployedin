"use client";

import { ExternalLink, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The candidate's portfolio and profile links, for an employer reviewing them.
 *
 * A portfolio typed on the apply form is stored on the application as a
 * `portfolio` document; profile links live in `JobSeeker.socialLinks`. Neither
 * was rendered anywhere on the employer side (client report 2026-09-30).
 */

interface ApplicationDocument {
  name: string;
  url: string;
  type: string;
}

interface SocialLink {
  label?: string;
  url?: string;
}

export interface CandidateLink {
  label: string;
  url: string;
  source: "application" | "profile";
}

/**
 * http(s) only. The validators behind these fields use zod `url()`, which
 * accepts `javascript:` — never let one reach an href. A bare "www.…" gets https.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^www\./i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function candidateLinks({
  documents,
  socialLinks,
}: {
  documents?: ApplicationDocument[] | null;
  socialLinks?: SocialLink[] | null;
}): CandidateLink[] {
  const links: CandidateLink[] = [];
  const seen = new Set<string>();
  const add = (label: string, raw: string | undefined, source: CandidateLink["source"]) => {
    const url = safeExternalUrl(raw);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ label: label.trim() || url, url, source });
  };
  for (const doc of documents ?? []) {
    if (doc.type === "portfolio") add(doc.name || "Portfolio", doc.url, "application");
  }
  for (const link of socialLinks ?? []) add(link.label ?? "", link.url, "profile");
  return links;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CandidateLinks({
  documents,
  socialLinks,
  className,
}: {
  documents?: ApplicationDocument[] | null;
  socialLinks?: SocialLink[] | null;
  className?: string;
}) {
  const t = useTranslations("employerApplications");
  const links = candidateLinks({ documents, socialLinks });
  if (links.length === 0) return null;

  return (
    <section className={className} aria-label={t("candidateLinksTitle")}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("candidateLinksTitle")}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-background/70 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Link2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{link.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{hostOf(link.url)}</span>
              </span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
              <span className="sr-only">{t("candidateLinkNewTab")}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
