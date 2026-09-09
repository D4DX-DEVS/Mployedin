"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Briefcase, LayoutTemplate, Loader2, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import RelativeDate from "@/components/shared/RelativeDate";
import { useDebounce } from "@/hooks/useDebounce";
import { useJobTemplateLibrary, useUseJobTemplate, type JobTemplateDetail } from "@/hooks/useJobs";

interface TemplatePickerProps {
  locale: string;
}

const LINK_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background/80 px-3 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-10 sm:px-4";

/**
 * `/employer/jobs/new?from=template`: pick a saved role, get a draft, land in
 * the editor. The library page keeps edit / duplicate / delete; this page only
 * chooses, so a repeat poster is two taps from the form.
 */
export function TemplatePicker({ locale }: TemplatePickerProps) {
  const t = useTranslations("employerNewJob");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const query = useDebounce(search.trim(), 300);
  const { data, isLoading, isError, refetch } = useJobTemplateLibrary({ search: query || undefined, page, limit });
  const useTemplate = useUseJobTemplate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const templates = data?.templates ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function choose(template: JobTemplateDetail) {
    setBusyId(template._id);
    try {
      const result = await useTemplate.mutateAsync(template._id);
      router.push(`/${locale}/employer/jobs/${result.job._id}/edit`);
    } catch {
      toast.error(t("toastUseError"));
      setBusyId(null);
    }
  }

  let body: React.ReactNode;
  if (isLoading) {
    body = <ListSkeleton count={5} />;
  } else if (isError) {
    body = <ErrorState description={t("loadError")} onRetry={() => refetch()} retryLabel={t("retry")} />;
  } else if (templates.length === 0 && query) {
    body = (
      <EmptyState
        icon={Search}
        title={t("noMatches", { query })}
        action={<Button variant="outline" className="min-h-11 rounded-xl sm:min-h-10" onClick={() => setSearch("")}>{t("clearSearch")}</Button>}
      />
    );
  } else if (templates.length === 0) {
    // Templates are only made from an existing job, so the empty state points
    // at the jobs list instead of dead-ending.
    body = (
      <EmptyState
        icon={LayoutTemplate}
        title={t("noTemplates")}
        description={t("noTemplatesHint")}
        action={<Link href={`/${locale}/employer/jobs`} className={LINK_BUTTON}>{t("goToJobs")}</Link>}
      />
    );
  } else {
    body = (
      <div className="card-base overflow-hidden">
        <ul className="divide-y divide-border/60">
          {templates.map((template) => {
            const busy = busyId === template._id;
            const subtitle = [template.title, template.requirements?.skills?.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
            return (
              <li key={template._id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex" aria-hidden>
                  <Briefcase className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{template.name}</p>
                  {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    <RelativeDate date={template.updatedAt} prefix={t("savedPrefix")} />
                    {template.usageCount ? <> · {t("usedCount", { count: template.usageCount })}</> : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="min-h-11 shrink-0 rounded-xl sm:min-h-9"
                  onClick={() => choose(template)}
                  disabled={busy || useTemplate.isPending}
                  aria-label={`${t("useTemplate")}: ${template.name}`}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />}
                  <span className="ms-1">{busy ? t("usingTemplate") : t("useTemplate")}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("fromTemplateTitle")}
        context={t("fromTemplateContext")}
        actions={
          // Icon-only below `sm`, like the AI creator's form link: the label
          // beside a two-line title clipped the context line on a 390px phone.
          <Link href={`/${locale}/employer/job-templates`} className={LINK_BUTTON} aria-label={t("manageTemplates")}>
            <Settings2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("manageTemplates")}</span>
          </Link>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="min-h-11 ps-9 sm:min-h-10"
        />
      </div>

      {body}

      {!isLoading && !isError && total > limit ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          shown={templates.length}
          onPageChange={setPage}
          onLimitChange={(next) => { setLimit(next); setPage(1); }}
        />
      ) : null}
    </div>
  );
}
