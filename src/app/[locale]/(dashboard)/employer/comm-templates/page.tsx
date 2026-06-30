"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Trash2, Plus, Mail } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { PageHero } from "@/components/shared/PageHero";
import { FeatureGate } from "@/components/shared/FeatureGate";
import type { CommTemplateType } from "@/models/CommTemplate";
import { toast } from "sonner";
import { useCommTemplates, useCreateCommTemplate, useDeleteCommTemplate } from "@/hooks/useCommTemplates";
import type { CommTemplate } from "@/hooks/useCommTemplates";

const TYPE_LABELS_KEY: Record<CommTemplateType, string> = {
  rejection: "rejection",
  invite: "interviewInvite",
  followup: "followUp",
  offer: "offer",
};

const TYPE_COLORS: Record<CommTemplateType, string> = {
  rejection: "bg-red-100 text-red-700 border-red-200",
  invite: "bg-blue-100 text-blue-700 border-blue-200",
  followup: "bg-amber-100 text-amber-700 border-amber-200",
  offer: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function CommTemplatesPage() {
  const t = useTranslations("employerCommTemplates");
  const tc = useTranslations("employerCommon");
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [filterType, setFilterType] = useState<CommTemplateType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "rejection" as CommTemplateType,
    subject: "",
    body: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: templates = [], isLoading: loading } = useCommTemplates(filterType);
  const createMutation = useCreateCommTemplate();
  const deleteMutation = useDeleteCommTemplate();

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ name: "", type: "rejection", subject: "", body: "" });
      setShowForm(false);
    } catch (err: unknown) {
      toast.error(t("errorCreating", { error: err instanceof Error ? err.message : t("unknownError") }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId: string, templateName: string) {
    const ok = await confirmDialog(t("deleteConfirmNamed", { name: templateName }));
    if (!ok) return;

    try {
      await deleteMutation.mutateAsync(templateId);
    } catch {
      toast.error(t("errorDeleting"));
    }
  }

  const filteredTemplates = filterType === "all"
    ? templates
    : templates.filter((t) => t.type === filterType);

  return (
    <FeatureGate feature="commTemplates">
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <PageHero
        icon={Mail}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("newTemplate")}
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "rejection", "invite", "followup", "offer"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterType(tab === "all" ? "all" : tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab === "all" ? t("allTemplates") : t(TYPE_LABELS_KEY[tab])}
          </button>
        ))}
      </div>

      {/* New Template Form */}
      {showForm && (
        <div className="border rounded-lg p-6 bg-card space-y-4">
          <h3 className="font-semibold text-lg">{t("newTemplate")}</h3>
          <form onSubmit={handleCreateTemplate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("templateName")}</label>
              <Input
                placeholder={t("nameExample")}
                maxLength={100}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("templateType")}</label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as CommTemplateType })}
              >
                <SelectTrigger aria-label={t("templateType")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rejection">{t("rejection")}</SelectItem>
                  <SelectItem value="invite">{t("interviewInvite")}</SelectItem>
                  <SelectItem value="followup">{t("followUp")}</SelectItem>
                  <SelectItem value="offer">{t("offer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("emailSubject")}</label>
              <Input
                placeholder={t("subjectExample")}
                maxLength={200}
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t("body")}</label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("placeholdersHint")}
              </p>
              <textarea
                placeholder={t("bodyPlaceholder")}
                maxLength={5000}
                rows={8}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("charactersCount", { count: formData.body.length })}
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: "", type: "rejection", subject: "", body: "" });
                }}
                disabled={saving}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? tc("loading") : t("save")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4 bg-card space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-9 w-full rounded" />
            </div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("noTemplates")}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <div key={template._id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
                  <Badge className={`w-fit ${TYPE_COLORS[template.type]}`}>
                    {t(TYPE_LABELS_KEY[template.type])}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground uppercase">{t("subjectLabel")}</p>
                  <p className="text-foreground font-medium truncate">{template.subject}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground uppercase">{t("previewLabel")}</p>
                  <p className="text-foreground text-sm line-clamp-3">{template.body}</p>
                </div>
              </div>

              {template.isDefault && (
                <div className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-1 w-fit">
                  {t("defaultTemplate")}
                </div>
              )}

              <button
                onClick={() => handleDeleteTemplate(template._id, template.name)}
                className="w-full mt-2 px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {tc("delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
    </FeatureGate>
  );
}
