"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ArrowLeft, Loader2, AlertCircle, Save, Eye, Code } from "lucide-react";
import { toast } from "sonner";

export default function NewStaticPage() {
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("adminCmsStaticPagesNew");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [body, setBody] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [isActive, setIsActive] = useState("true");

  const [bodyTab, setBodyTab] = useState<"code" | "preview">("code");
  const [bodyArTab, setBodyArTab] = useState<"code" | "preview">("code");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/cms/static-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, titleAr, body, bodyAr, isActive: isActive === "true" }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Failed to create");
      }
      toast.success(t("successToast"));
      router.push(`/${locale}/admin/cms/static-pages`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <DashboardPageHeader
        eyebrow={t("workspaceLabel")}
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={(
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/${locale}/admin/cms/static-pages`)}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
      />

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Basic fields */}
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t("basicInfoHeading")}</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">
                {t("slugLabel")} <span className="text-destructive">{t("slugRequired")}</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder={t("slugPlaceholder")}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">{t("statusLabel")}</Label>
              <SearchableSelect
                id="isActive"
                options={[
                  { value: "true", label: t("statusActive") },
                  { value: "false", label: t("statusInactive") },
                ]}
                value={isActive}
                onValueChange={setIsActive}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">
                {t("titleEnglishLabel")} <span className="text-destructive">{t("titleEnglishRequired")}</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={t("titleEnglishPlaceholder")}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="titleAr">{t("titleArabicLabel")}</Label>
              <Input
                id="titleAr"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder={t("titleArabicPlaceholder")}
                className="h-11"
                dir="rtl"
              />
            </div>
          </div>
        </section>

        {/* Body English */}
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("bodyEnglishHeading")} <span className="text-destructive">{t("bodyEnglishRequired")}</span>
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-0.5">
              <button
                type="button"
                onClick={() => setBodyTab("code")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  bodyTab === "code"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code className="h-3.5 w-3.5" /> {t("bodyEnglishHtmlTab")}
              </button>
              <button
                type="button"
                onClick={() => setBodyTab("preview")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  bodyTab === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" /> {t("bodyEnglishPreviewTab")}
              </button>
            </div>
          </div>
          <div className="mt-4">
            {bodyTab === "code" ? (
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                placeholder={t("bodyEnglishPlaceholder")}
                rows={20}
                className="min-h-[300px] font-mono text-sm leading-relaxed"
              />
            ) : (
              <div className="min-h-[300px] rounded-xl border border-border bg-background p-6 overflow-auto">
                <div
                  className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-h2:text-xl prose-h2:font-semibold prose-h3:text-lg prose-p:leading-7"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Body Arabic */}
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{t("bodyArabicHeading")}</h2>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-0.5">
              <button
                type="button"
                onClick={() => setBodyArTab("code")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  bodyArTab === "code"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code className="h-3.5 w-3.5" /> {t("bodyArabicHtmlTab")}
              </button>
              <button
                type="button"
                onClick={() => setBodyArTab("preview")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  bodyArTab === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" /> {t("bodyArabicPreviewTab")}
              </button>
            </div>
          </div>
          <div className="mt-4">
            {bodyArTab === "code" ? (
              <Textarea
                id="bodyAr"
                value={bodyAr}
                onChange={(e) => setBodyAr(e.target.value)}
                placeholder={t("bodyArabicPlaceholder")}
                rows={20}
                className="min-h-[300px] font-mono text-sm leading-relaxed"
                dir="rtl"
              />
            ) : (
              <div className="min-h-[300px] rounded-xl border border-border bg-background p-6 overflow-auto" dir="rtl">
                <div
                  className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-h2:text-xl prose-h2:font-semibold prose-h3:text-lg prose-p:leading-7"
                  dangerouslySetInnerHTML={{ __html: bodyAr }}
                />
              </div>
            )}
          </div>
        </section>

        {/* Actions */}
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/${locale}/admin/cms/static-pages`)}
              disabled={saving}
              className="h-11 rounded-xl"
            >
              {t("cancelButton")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              size="lg"
              className="h-11 gap-2 rounded-xl px-6"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? t("savingButton") : t("createPageButton")}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
