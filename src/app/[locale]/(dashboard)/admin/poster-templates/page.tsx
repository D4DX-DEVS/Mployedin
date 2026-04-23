"use client";

import { useState } from "react";
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
} from "lucide-react";

export default function PosterTemplatesPage() {
  const { locale } = useParams();
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const params: Record<string, string> = {};
  if (filter === "active") params.isActive = "true";
  if (filter === "inactive") params.isActive = "false";

  const { data, isLoading, error } = usePosterTemplates(params);
  const deleteMutation = useDeletePosterTemplate();

  const items = data?.items ?? [];

  return (
    <div className="page-container admin-cms-page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Poster Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Design background templates for employer job posters
          </p>
        </div>
        <Link href={`/${locale}/admin/poster-templates/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> New Template
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "active", "inactive"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl border bg-muted animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          Failed to load templates. Please try again.
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutTemplate className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No templates yet</h3>
          <p className="text-muted-foreground text-sm mt-1 mb-4">
            Create your first poster template for employers to use.
          </p>
          <Link href={`/${locale}/admin/poster-templates/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Template
            </Button>
          </Link>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} ({data.total} templates)
          </span>
        </div>
      )}
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
    <div className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
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

        {/* Accent color dot */}
        <div
          className="absolute top-3 left-3 h-5 w-5 rounded-full border-2 border-white shadow"
          style={{ backgroundColor: tmpl.defaultAccentColor }}
        />
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm truncate">{tmpl.name}</h3>
            <Badge variant="secondary" className="mt-1 text-xs">
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

        {/* Available sizes */}
        <div className="flex gap-1">
          {tmpl.backgroundImages.landscape && (
            <Badge variant="outline" className="text-[10px]">
              Landscape
            </Badge>
          )}
          {tmpl.backgroundImages.square && (
            <Badge variant="outline" className="text-[10px]">
              Square
            </Badge>
          )}
          {tmpl.backgroundImages.story && (
            <Badge variant="outline" className="text-[10px]">
              Story
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link
            href={`/${locale}/admin/poster-templates/${tmpl._id}/edit`}
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full">
              <Edit className="mr-1 h-3 w-3" /> Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
