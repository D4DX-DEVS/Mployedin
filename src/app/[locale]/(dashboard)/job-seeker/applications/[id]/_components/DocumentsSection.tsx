"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Loader2, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";

// ── Documents Section ──────────────────────────────────────────────
export function DocumentsSection({
  applicationId,
  documents,
  isActive,
  onUpdated,
  t,
  tc,
}: {
  applicationId: string;
  documents: { name: string; url: string; type: string }[];
  isActive: boolean;
  onUpdated: () => void;
  t: ReturnType<typeof useTranslations>;
  tc: ReturnType<typeof useTranslations>;
}) {
  const { confirm, ConfirmDialogNode } = useConfirm();
  const tConfirm = useTranslations("confirm");
  // Same labels as the type picker below; static keys because next-intl
  // throws on an unknown key and older rows hold free-text types.
  const docTypeLabel = (type: string) => {
    switch (type) {
      case "resume": return t("docResume");
      case "cover_letter": return t("docCoverLetter");
      case "portfolio": return t("docPortfolio");
      case "certification": return t("docCertification");
      case "reference": return t("docReference");
      case "id_document": return t("docIdDocument");
      case "other": return t("docOther");
      default: return type.replace("_", " ");
    }
  };
  const [showUpload, setShowUpload] = useState(false);
  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleAdd() {
    if (!docName.trim() || !docUrl.trim()) return;
    setUploading(true);
    try {
      const res = await csrfFetch(`/api/applications/${applicationId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: docName.trim(), url: docUrl.trim(), type: docType }),
      });
      if (res.ok) {
        setDocName("");
        setDocUrl("");
        setDocType("other");
        setShowUpload(false);
        onUpdated();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(url: string) {
    const ok = await confirm({
      message: tConfirm("deleteMessage"),
      confirmLabel: tConfirm("delete"),
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(url);
    try {
      const res = await csrfFetch(`/api/applications/${applicationId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) onUpdated();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="space-y-3">
      {ConfirmDialogNode}
      <div className="flex items-center justify-between">
        {/* h3: sits under "What you sent" on the application page. */}
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {t("documents")} ({documents.length})
        </h3>
        {isActive && (
          <Button
            size="dense"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Plus className="h-3.5 w-3.5" /> {t("addDocument")}
          </Button>
        )}
      </div>

      {/* Document List */}
      {documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <div
              key={`${doc.url}-${i}`}
              className="card-base rounded-xl border flex items-center gap-3 panel-body"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/applications/${applicationId}/documents/download?i=${i}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline truncate block"
                >
                  {doc.name}
                </a>
                <span className="text-[11px] text-muted-foreground">{docTypeLabel(doc.type)}</span>
              </div>
              {isActive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(doc.url)}
                  disabled={deleting === doc.url}
                >
                  {deleting === doc.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card-base rounded-xl border border-dashed text-center text-muted-foreground text-sm panel-body">
          {t("noDocumentsAttached")}
        </div>
      )}

      {/* Add Document Form */}
      {showUpload && (
        <div className="card-base rounded-xl border space-y-3 panel-body">
          <h3 className="heading-label font-medium">{t("addDocument")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("documentName")}</label>
              <Input
                placeholder={t("documentNamePlaceholder")}
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="h-9 text-sm"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("type")}</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t("selectType")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resume">{t("docResume")}</SelectItem>
                  <SelectItem value="cover_letter">{t("docCoverLetter")}</SelectItem>
                  <SelectItem value="portfolio">{t("docPortfolio")}</SelectItem>
                  <SelectItem value="certification">{t("docCertification")}</SelectItem>
                  <SelectItem value="reference">{t("docReference")}</SelectItem>
                  <SelectItem value="id_document">{t("docIdDocument")}</SelectItem>
                  <SelectItem value="other">{t("docOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("documentUrl")}</label>
            <Input
              placeholder="https://drive.google.com/..."
              value={docUrl}
              onChange={(e) => setDocUrl(e.target.value)}
              className="h-9 text-sm"
              type="url"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("uploadDocumentHint")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="dense"
              className="gap-1.5"
              onClick={handleAdd}
              disabled={!docName.trim() || !docUrl.trim() || uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {t("addDocument")}
            </Button>
            <Button size="dense" variant="ghost" className="" onClick={() => setShowUpload(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
