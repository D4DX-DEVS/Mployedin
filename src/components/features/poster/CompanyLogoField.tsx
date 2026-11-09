"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The company logo, editable from the brand kit. It is the same logo as
 * Settings › Company profile (one logo per company, POST/DELETE
 * /api/employers/logo), so changing it here changes it there too.
 */
export function CompanyLogoField({ logoUrl, companyName }: { logoUrl: string | null; companyName: string }) {
  const t = useTranslations("brandKit");
  const qc = useQueryClient();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["brand-kit"] });

  async function upload(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) return toast.error(t("logoTypeError"));
    if (file.size > MAX_BYTES) return toast.error(t("logoSizeError"));
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("logo", file);
      const res = await fetch("/api/employers/logo", { method: "POST", body });
      if (!res.ok) throw new Error("upload failed");
      await refresh();
      toast.success(t("logoUploaded"));
    } catch {
      toast.error(t("logoUploadError"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    const ok = await confirm({ title: t("logoRemoveTitle"), message: t("logoRemoveMessage"), confirmLabel: t("logoRemove"), variant: "destructive" });
    if (!ok) return;
    setBusy("remove");
    try {
      const res = await fetch("/api/employers/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      await refresh();
      toast.success(t("logoRemoved"));
    } catch {
      toast.error(t("logoUploadError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {ConfirmDialogNode}
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
        {logoUrl ? (
           
          <img src={logoUrl} alt={t("logoAlt", { company: companyName })} className="size-14 object-contain" />
        ) : (
          <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label={logoUrl ? t("logoReplace") : t("logoUpload")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={busy !== null} onClick={() => input.current?.click()}>
          {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {logoUrl ? t("logoReplace") : t("logoUpload")}
        </Button>
        {logoUrl ? (
          <Button type="button" variant="ghost" className="min-h-11 gap-2 text-destructive hover:text-destructive" disabled={busy !== null} onClick={remove}>
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {t("logoRemove")}
          </Button>
        ) : null}
      </div>
      <p className="w-full text-xs text-muted-foreground">{t("logoShared")}</p>
    </div>
  );
}
