"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  usePosterTemplates,
  useDeletePosterTemplate,
  useUpdatePosterTemplate,
} from "@/hooks/usePosterTemplates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  LayoutTemplate,
  Plus,
  Edit,
  Trash2,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import CmsHeroFilters, {
  type CmsFilterField,
  type CmsFilterValues,
  cmsFiltersAreActive,
  getDefaultCmsFilterValues,
} from "@/components/features/admin/CmsHeroFilters";

const POSTER_FILTER_FIELDS: CmsFilterField[] = [
  { type: "search", placeholder: "Search template name…" },
  {
    type: "status",
    label: "Visibility",
    options: [
      { value: "all", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
  {
    type: "text",
    key: "category",
    label: "Category",
    placeholder: "e.g. professional, minimal",
    param: "category",
  },
];

export default function PosterTemplatesPage() {
  const { locale } = useParams();
  const [filterValues, setFilterValues] = useState<CmsFilterValues>(getDefaultCmsFilterValues);
  const [showFilters, setShowFilters] = useState(false);

  const params: Record<string, string> = {};
  if (filterValues.status === "active") params.isActive = "true";
  if (filterValues.status === "inactive") params.isActive = "false";
  const category = filterValues.extras.category?.trim();
  if (category) params.category = category;

  const { data, isLoading, error } = usePosterTemplates(params);
  const deleteMutation = useDeletePosterTemplate();

  const hasActiveFilters = cmsFiltersAreActive(filterValues, POSTER_FILTER_FIELDS);

  const allItems = data?.items ?? [];
  const items = useMemo(() => {
    const q = filterValues.search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [allItems, filterValues.search]);

  const activeCount = allItems.filter((t) => t.isActive).length;

  const resetFilters = () => setFilterValues(getDefaultCmsFilterValues());

  return (
    <div className="page-container admin-cms-page-container space-y-6">
      {/* Hero Section */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              CMS Workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Poster Templates
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Design background templates for employer job posters. Create visually appealing templates with multiple format support.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Templates</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{data?.total ?? items.length}</p>
              <p className="text-xs text-muted-foreground">{activeCount} active</p>
            </div>
            <Link href={`/${locale}/admin/poster-templates/new`}>
              <Button className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{data?.total ?? items.length}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-950/30">
                <LayoutTemplate className="h-5 w-5 text-sky-600" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">All templates</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{activeCount}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">Available to employers</p>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inactive</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{items.length - activeCount}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/30">
                <span className="h-3 w-3 rounded-full bg-amber-500" />
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">Currently disabled</p>
          </div>
        </div>

        <CmsHeroFilters
          fields={POSTER_FILTER_FIELDS}
          values={filterValues}
          onChange={setFilterValues}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          searchPlaceholder="Search template name or category…"
        />
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl border bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Failed to load templates. Please try again.
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="workspace-muted-pill mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px]">
              <LayoutTemplate className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {hasActiveFilters ? "No matching templates" : "No templates yet"}
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {hasActiveFilters
                ? "No templates match the current filters."
                : "Create your first poster template"}
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {hasActiveFilters
                ? "Adjust filters in the hero section or clear them to see more results."
                : "Design poster backgrounds for employers to use when sharing job openings."}
            </p>
            {hasActiveFilters ? (
              <Button
                variant="outline"
                className="mt-6"
                onClick={resetFilters}
              >
                Clear filters
              </Button>
            ) : (
              <Link href={`/${locale}/admin/poster-templates/new`}>
                <Button className="mt-6 h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
                  <Plus className="h-4 w-4" /> Create Template
                </Button>
              </Link>
            )}
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((tmpl) => (
              <TemplateCard
                key={tmpl._id}
                template={tmpl}
                locale={String(locale)}
                onDelete={() => {
                  if (confirm("Deactivate this template?")) {
                    deleteMutation.mutate(tmpl._id);
                  }
                }}
              />
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-6">
            <span className="text-sm text-muted-foreground">
              Page {data.page} of {data.totalPages} ({data.total} templates)
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateCard({
  template: tmpl,
  locale,
  onDelete,
}: {
  template: {
    _id: string;
    name: string;
    category: string;
    backgroundImages: { landscape?: string; square?: string; story?: string };
    isActive: boolean;
    defaultAccentColor: string;
    createdAt: string;
  };
  locale: string;
  onDelete: () => void;
}) {
  const updateMutation = useUpdatePosterTemplate(tmpl._id);

  const previewImage =
    tmpl.backgroundImages.landscape ??
    tmpl.backgroundImages.square ??
    tmpl.backgroundImages.story;

  return (
    <div className="workspace-subtle-surface group relative overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)]">
      {/* Preview */}
      <div className="relative h-44 bg-muted">
        {previewImage ? (
          <img
            src={previewImage}
            alt={tmpl.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}

        <div
          className="absolute top-3 left-3 h-5 w-5 rounded-full border-2 border-white shadow"
          style={{ backgroundColor: tmpl.defaultAccentColor }}
        />
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm truncate">{tmpl.name}</h3>
            <Badge variant="secondary" className="mt-1 rounded-full text-xs">
              {tmpl.category}
            </Badge>
          </div>
          <Switch
            checked={tmpl.isActive}
            onCheckedChange={(checked) =>
              updateMutation.mutate({ isActive: checked })
            }
          />
        </div>

        <div className="flex gap-1">
          {tmpl.backgroundImages.landscape && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              Landscape
            </Badge>
          )}
          {tmpl.backgroundImages.square && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              Square
            </Badge>
          )}
          {tmpl.backgroundImages.story && (
            <Badge variant="outline" className="rounded-full text-[10px]">
              Story
            </Badge>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Link
            href={`/${locale}/admin/poster-templates/${tmpl._id}/edit`}
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full rounded-lg">
              <Edit className="mr-1 h-3 w-3" /> Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
