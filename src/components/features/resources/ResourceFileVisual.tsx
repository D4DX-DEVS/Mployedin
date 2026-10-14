"use client";

import { useState } from "react";
import { FileArchive, FileText, FileImage, FileVideo, File as FileIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileExtensionLabel, fileTypeOf } from "@/lib/resources/fileTypes";
import type { ResourceFile } from "./types";

const TYPE_STYLE: Record<string, { icon: LucideIcon; tile: string }> = {
  pdf: { icon: FileText, tile: "bg-red-50 text-red-600" },
  image: { icon: FileImage, tile: "bg-sky-50 text-sky-600" },
  video: { icon: FileVideo, tile: "bg-violet-50 text-violet-600" },
  document: { icon: FileText, tile: "bg-blue-50 text-blue-600" },
  archive: { icon: FileArchive, tile: "bg-amber-50 text-amber-700" },
  other: { icon: FileIcon, tile: "bg-muted text-muted-foreground" },
};

export function fileTypeStyle(file: Pick<ResourceFile, "contentType"> | undefined) {
  return TYPE_STYLE[fileTypeOf(file?.contentType)];
}

/** Small coloured type icon, used beside a file name. */
export function FileTypeIcon({ file, className }: { file: Pick<ResourceFile, "contentType">; className?: string }) {
  const { icon: Icon, tile } = fileTypeStyle(file);
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tile, className)} aria-hidden="true">
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Card thumbnail: the real image for image files, otherwise a type tile with
 * the extension. Never a stock picture — what you see is the file.
 */
export function ResourceThumbnail({ file, className }: { file?: ResourceFile; className?: string }) {
  const [broken, setBroken] = useState(false);
  const { icon: Icon, tile } = fileTypeStyle(file);
  const showImage = file && fileTypeOf(file.contentType) === "image" && !broken;

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-border/60", !showImage && tile, className)}>
      {showImage ? (
         
        <img src={file.url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1" aria-hidden="true">
          <Icon className="size-6" />
          {file && <span className="text-[10px] font-bold tracking-wide">{fileExtensionLabel(file.fileName, file.contentType)}</span>}
        </div>
      )}
    </div>
  );
}
