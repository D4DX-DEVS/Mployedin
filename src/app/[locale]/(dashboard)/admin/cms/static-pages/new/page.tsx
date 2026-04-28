"use client";

import { useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
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
      toast.success("Static page created successfully");
      router.push(`/${locale}/admin/cms/static-pages`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/${locale}/admin/cms/static-pages`)}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              CMS workspace
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Create Static Page
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a new static page with English and Arabic content.
            </p>
          </div>
        </div>
      </section>

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
          <h2 className="text-lg font-semibold tracking-tight">Basic Information</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder="e.g. privacy-policy"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <SearchableSelect
                id="isActive"
                options={[
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                value={isActive}
                onValueChange={setIsActive}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">
                Title (English) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Privacy Policy"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="titleAr">Title (Arabic)</Label>
              <Input
                id="titleAr"
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder="سياسة الخصوصية"
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
              Body (English - HTML) <span className="text-destructive">*</span>
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
                <Code className="h-3.5 w-3.5" /> HTML
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
                <Eye className="h-3.5 w-3.5" /> Preview
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
                placeholder="<h2>Section Title</h2><p>Content here...</p>"
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
            <h2 className="text-lg font-semibold tracking-tight">Body (Arabic - HTML)</h2>
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
                <Code className="h-3.5 w-3.5" /> HTML
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
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
          </div>
          <div className="mt-4">
            {bodyArTab === "code" ? (
              <Textarea
                id="bodyAr"
                value={bodyAr}
                onChange={(e) => setBodyAr(e.target.value)}
                placeholder="المحتوى بالعربية"
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-11 gap-2 rounded-xl bg-sky-600 px-6 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Create Page"}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
