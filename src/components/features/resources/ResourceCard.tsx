"use client";

import { CalendarDays, Download, Eye, History, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatListDate } from "@/lib/ui/intlFormat";
import { formatFileSize } from "@/lib/ui/fileSize";
import { fileExtensionLabel, isPreviewable } from "@/lib/resources/fileTypes";
import { FileTypeIcon, ResourceThumbnail } from "./ResourceFileVisual";
import type { Resource, ResourceFile } from "./types";

interface ResourceCardProps {
  item: Resource;
  categoryLabel: string;
  pendingKey: string | null;
  onOpen: (item: Resource, file?: ResourceFile) => void;
  onDownload: (item: Resource, file: ResourceFile) => void;
}

/**
 * One resource, same structure every time: thumbnail, title, category,
 * description, primary file, metadata, then Preview/Details + Download at the
 * bottom so actions line up across a row of cards.
 */
export function ResourceCard({ item, categoryLabel, pendingKey, onOpen, onDownload }: ResourceCardProps) {
  const t = useTranslations("resources");
  const primary = item.files?.[0];
  const extraFiles = Math.max(0, (item.files?.length ?? 0) - 1);
  const downloading = primary ? pendingKey === primary.key : false;
  const canPreview = isPreviewable(primary?.contentType);

  return (
    <article className="workspace-glass-panel flex h-full flex-col rounded-2xl p-4 transition-shadow duration-200 hover:shadow-[0_24px_50px_-38px_rgba(2,132,199,0.38)] sm:p-5">
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => onOpen(item, primary)}
          className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("detailsFor", { title: item.title })}
        >
          <ResourceThumbnail file={primary} className="h-20 w-24 sm:w-28" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="line-clamp-2 break-words font-semibold leading-snug text-foreground" title={item.title}>
            {item.title}
          </h3>
          <Badge variant="info">{categoryLabel}</Badge>
          {item.description && (
            <p className="line-clamp-2 text-sm leading-5 text-muted-foreground" title={item.description}>{item.description}</p>
          )}
        </div>
      </div>

      {primary ? (
        <div className="mt-4 flex min-w-0 items-center gap-3">
          <FileTypeIcon file={primary} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={primary.fileName}>{primary.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {fileExtensionLabel(primary.fileName, primary.contentType)} · {formatFileSize(primary.size)}
              {extraFiles > 0 && (
                <>
                  {" · "}
                  <button type="button" onClick={() => onOpen(item)} className="font-medium text-primary hover:underline">
                    {t("moreFiles", { count: extraFiles })}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t("noFiles")}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><History className="size-3.5" aria-hidden="true" />{t("versionN", { n: item.version ?? 1 })}</span>
        <span className="inline-flex items-center gap-1.5"><Download className="size-3.5" aria-hidden="true" />{t("downloadsCount", { count: item.downloadCount ?? 0 })}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden="true" />{formatListDate(item.createdAt)}</span>
      </div>

      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="outline" size="sm" className="min-h-11 flex-1 gap-1.5 sm:min-h-9" onClick={() => onOpen(item, primary)}>
          {canPreview ? <Eye className="size-4" aria-hidden="true" /> : <Info className="size-4" aria-hidden="true" />}
          {canPreview ? t("preview") : t("details")}
        </Button>
        <Button
          size="sm"
          className="min-h-11 flex-1 gap-1.5 sm:min-h-9"
          disabled={!primary || downloading}
          aria-busy={downloading}
          onClick={() => primary && onDownload(item, primary)}
        >
          {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          {t("download")}
        </Button>
      </div>
    </article>
  );
}
