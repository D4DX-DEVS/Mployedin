"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { csrfFetch } from "@/lib/security/csrf-client";
import type { ResourceFile } from "./types";

/**
 * Downloads go through POST /api/resources/[id]: it checks access, counts the
 * download and returns a signed URL that saves under the real file name. The
 * stored file URL is private and answers 403, which is what the old
 * `window.open(file.url)` hit for newly uploaded files.
 */
export function useResourceDownload(onDownloaded?: (resourceId: string) => void) {
  const t = useTranslations("resources");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const busy = useRef(false);

  const download = async (resourceId: string, file: ResourceFile): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPendingKey(file.key);
    const retry = { label: t("retry"), onClick: () => { void download(resourceId, file); } };
    try {
      const res = await csrfFetch(`/api/resources/${resourceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey: file.key }),
      });
      const data: { url?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        toast.error(res.status === 404 ? t("fileUnavailable") : t("downloadError"), res.status === 404 ? undefined : { action: retry });
        return;
      }
      // The signed URL carries `Content-Disposition: attachment`, so following
      // it saves the file without leaving the page.
      const link = document.createElement("a");
      link.href = data.url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      onDownloaded?.(resourceId);
    } catch {
      toast.error(t("downloadError"), { action: retry });
    } finally {
      busy.current = false;
      setPendingKey(null);
    }
  };

  return { download, pendingKey };
}
