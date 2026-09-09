"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, FileUp, LayoutTemplate, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";

interface NewJobChooserProps {
  locale: string;
}

interface StartOption {
  key: string;
  href: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  recommended?: boolean;
}

/**
 * `/employer/jobs/new` opened bare. Four ways in, one tap each; every option
 * is a plain link to a route that already exists, so the Create menu and ⌘K
 * entries (which deep-link past this page) stay the fast path.
 */
export function NewJobChooser({ locale }: NewJobChooserProps) {
  const t = useTranslations("employerNewJob");
  const base = `/${locale}/employer/jobs`;
  const options: StartOption[] = [
    { key: "ai", href: `${base}/ai-create`, Icon: Sparkles, title: t("withAi"), description: t("withAiDesc"), recommended: true },
    { key: "blank", href: `${base}/new?mode=manual`, Icon: PenLine, title: t("blank"), description: t("blankDesc") },
    { key: "template", href: `${base}/new?from=template`, Icon: LayoutTemplate, title: t("fromTemplate"), description: t("fromTemplateDesc") },
    { key: "document", href: `${base}/ai-extract`, Icon: FileUp, title: t("fromDocument"), description: t("fromDocumentDesc") },
  ];

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={t("context")} />
      <ul aria-label={t("optionsLabel")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {options.map(({ key, href, Icon, title, description, recommended }) => (
          <li key={key}>
            <Link
              href={href}
              className="card-base group flex h-full min-h-11 items-center gap-3 p-4 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  {title}
                  {recommended ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{t("recommended")}</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">{description}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
