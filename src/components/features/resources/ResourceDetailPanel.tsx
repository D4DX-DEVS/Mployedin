"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { formatFileSize } from "@/lib/ui/fileSize";
import { fileExtensionLabel, fileTypeOf, isPreviewable } from "@/lib/resources/fileTypes";
import { FileTypeIcon, ResourceThumbnail } from "./ResourceFileVisual";
import type { Resource, ResourceFile } from "./types";

const DATE_TIME: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

/** When a newer file version was uploaded. Not `updatedAt`: edits and download counts move that. */
function lastFileUpload(item: Resource): string | undefined {
  if ((item.version ?? 1) <= 1) return undefined;
  const latest = (item.versionHistory ?? []).reduce<string | undefined>(
    (max, v) => (v.uploadedAt && (!max || v.uploadedAt > max) ? v.uploadedAt : max),
    undefined,
  );
  return latest && latest !== item.createdAt ? latest : undefined;
}

interface ResourceDetailPanelProps {
  item: Resource | null;
  initialFile?: ResourceFile;
  categoryLabel: string;
  pendingKey: string | null;
  onClose: () => void;
  onDownload: (item: Resource, file: ResourceFile) => void;
}

function FilePreview({ file }: { file: ResourceFile }) {
  const t = useTranslations("resources");
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file.key]);
  const type = fileTypeOf(file.contentType);

  if (failed || !isPreviewable(file.contentType)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 px-6 py-10 text-center">
        <ResourceThumbnail file={file} className="h-20 w-24" />
        <p className="max-w-xs text-sm text-muted-foreground">{failed ? t("previewUnavailable") : t("noPreview")}</p>
      </div>
    );
  }
  if (type === "image") {
     
    return <img src={file.url} alt={t("previewOf", { name: file.fileName })} onError={() => setFailed(true)} className="max-h-[50vh] w-full rounded-xl bg-muted/50 object-contain" />;
  }
  if (type === "video") {
    return <video src={file.url} controls preload="metadata" onError={() => setFailed(true)} className="max-h-[50vh] w-full rounded-xl bg-black" />;
  }
  return <iframe src={file.url} title={t("previewOf", { name: file.fileName })} className="h-[50vh] w-full rounded-xl border border-border/60 bg-muted/50" />;
}

/** Side panel for one resource: preview, every file, and the full metadata. */
export function ResourceDetailPanel({ item, initialFile, categoryLabel, pendingKey, onClose, onDownload }: ResourceDetailPanelProps) {
  const t = useTranslations("resources");
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initialFile?.key);
  useEffect(() => setSelectedKey(initialFile?.key ?? item?.files?.[0]?.key), [item, initialFile]);

  const file = item?.files?.find((f) => f.key === selectedKey) ?? item?.files?.[0];
  const uploader = item && typeof item.uploadedBy === "object" ? item.uploadedBy?.name : undefined;
  const downloading = file ? pendingKey === file.key : false;
  const lastUpload = item ? lastFileUpload(item) : undefined;

  const copyName = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.fileName);
      toast.success(t("fileNameCopied"));
    } catch {
      toast.error(t("copyError"));
    }
  };

  return (
    <Dialog open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl">
        {item && (
          <>
            <DialogHeader className="space-y-1 border-b px-5 pb-4 pt-5 pe-14">
              <DialogTitle className="break-words text-lg">{item.title}</DialogTitle>
              {/* asChild: Badge renders a <div>, which may not sit inside the default <p>. */}
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{categoryLabel}</Badge>
                  <span>{t("versionN", { n: item.version ?? 1 })}</span>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {file ? <FilePreview file={file} /> : <p className="text-sm text-muted-foreground">{t("noFiles")}</p>}

              {item.files.length > 1 && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">{t("filesInResource", { count: item.files.length })}</h4>
                  <ul className="space-y-1.5">
                    {item.files.map((f) => (
                      <li key={f.key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(f.key)}
                          aria-pressed={f.key === file?.key}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-start transition-colors",
                            f.key === file?.key ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/50",
                          )}
                        >
                          <FileTypeIcon file={f} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground" title={f.fileName}>{f.fileName}</span>
                            <span className="block text-xs text-muted-foreground">{fileExtensionLabel(f.fileName, f.contentType)} · {formatFileSize(f.size)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                {file && (
                  <>
                    <dt className="text-muted-foreground">{t("fileName")}</dt>
                    <dd className="flex min-w-0 items-start gap-1.5 text-foreground">
                      <span className="min-w-0 break-all">{file.fileName}</span>
                      <button type="button" onClick={copyName} aria-label={t("copyFileName")} className="tap-target-box -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Copy className="size-3.5" aria-hidden="true" />
                      </button>
                    </dd>
                    <dt className="text-muted-foreground">{t("fileTypeLabel")}</dt>
                    <dd className="text-foreground">{fileExtensionLabel(file.fileName, file.contentType)}</dd>
                    <dt className="text-muted-foreground">{t("fileSize")}</dt>
                    <dd className="text-foreground">{formatFileSize(file.size)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("version")}</dt>
                <dd className="text-foreground">{item.version ?? 1}</dd>
                <dt className="text-muted-foreground">{t("downloads")}</dt>
                <dd className="text-foreground">{item.downloadCount ?? 0}</dd>
                {uploader && (
                  <>
                    <dt className="text-muted-foreground">{t("uploadedBy")}</dt>
                    <dd className="text-foreground">{uploader}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("uploadDate")}</dt>
                <dd className="text-foreground">{formatDateTime(item.createdAt, DATE_TIME)}</dd>
                {lastUpload && (
                  <>
                    <dt className="text-muted-foreground">{t("lastUpdated")}</dt>
                    <dd className="text-foreground">{formatDateTime(lastUpload, DATE_TIME)}</dd>
                  </>
                )}
                {item.description && (
                  <>
                    <dt className="text-muted-foreground">{t("description")}</dt>
                    <dd className="whitespace-pre-line break-words text-foreground">{item.description}</dd>
                  </>
                )}
                {item.tags?.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t("tags")}</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                    </dd>
                  </>
                )}
              </dl>
            </div>

            <DialogFooter className="flex-row flex-wrap gap-2 border-t px-5 py-4 sm:justify-start">
              <Button className="min-h-11 gap-1.5 sm:min-h-9" disabled={!file || downloading} aria-busy={downloading} onClick={() => file && onDownload(item, file)}>
                {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                {t("download")}
              </Button>
              {file && isPreviewable(file.contentType) && (
                <Button variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => window.open(file.url, "_blank", "noopener")}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {t("openInNewTab")}
                </Button>
              )}
              <Button variant="ghost" className="min-h-11 sm:ms-auto sm:min-h-9" onClick={onClose}>{t("close")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
