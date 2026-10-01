"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, FileUp, LayoutTemplate, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { OnBehalfEmployerPicker } from "@/components/features/employer/job-form/OnBehalfEmployerPicker";
import { cn } from "@/lib/utils";

interface NewJobChooserProps {
  locale: string;
  /**
   * "agent": the agent first picks one of their assigned employers, and every
   * option carries it on as `?employer=`. The four ways in are the employer's.
   */
  basePath?: "employer" | "agent";
  employerId?: string;
}

interface StartOption {
  key: string;
  href: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  recommended?: boolean;
}

const CARD =
  "card-base group flex h-full min-h-11 items-center gap-3 p-4 transition sm:p-5";

/**
 * `/employer/jobs/new` opened bare. Four ways in, one tap each; every option
 * is a plain link to a route that already exists, so the Create menu and ⌘K
 * entries (which deep-link past this page) stay the fast path.
 */
export function NewJobChooser({ locale, basePath = "employer", employerId }: NewJobChooserProps) {
  const t = useTranslations("employerNewJob");
  const router = useRouter();
  const base = `/${locale}/${basePath}/jobs`;
  const forAgent = basePath === "agent";
  // An agent's options wait for the employer the job is for.
  const locked = forAgent && !employerId;
  const carry = (href: string) =>
    forAgent && employerId ? `${href}${href.includes("?") ? "&" : "?"}employer=${employerId}` : href;
  const options: StartOption[] = [
    { key: "ai", href: carry(`${base}/ai-create`), Icon: Sparkles, title: t("withAi"), description: t("withAiDesc"), recommended: true },
    { key: "blank", href: carry(`${base}/new?mode=manual`), Icon: PenLine, title: t("blank"), description: t("blankDesc") },
    { key: "template", href: carry(`${base}/new?from=template`), Icon: LayoutTemplate, title: t("fromTemplate"), description: t("fromTemplateDesc") },
    { key: "document", href: carry(`${base}/ai-extract`), Icon: FileUp, title: t("fromDocument"), description: t("fromDocumentDesc") },
  ];

  return (
    <div className="page-container">
      <WorkspaceHeader title={t("title")} context={t("context")} />
      {forAgent ? (
        <div className="mb-4">
          <OnBehalfEmployerPicker
            mode="agent"
            value={employerId ?? ""}
            onChange={(id) => router.replace(`${base}/new?employer=${id}`, { scroll: false })}
          />
          {locked ? <p className="mt-2 text-xs text-muted-foreground sm:text-sm">{t("chooseEmployerFirst")}</p> : null}
        </div>
      ) : null}
      <ul aria-label={t("optionsLabel")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {options.map(({ key, href, Icon, title, description, recommended }) => {
          const content = (
            <>
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
            </>
          );
          return (
            <li key={key}>
              {locked ? (
                <div aria-disabled="true" className={cn(CARD, "cursor-not-allowed opacity-60")}>
                  {content}
                </div>
              ) : (
                <Link
                  href={href}
                  className={cn(CARD, "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
