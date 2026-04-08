"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import type { CommTemplateType } from "@/models/CommTemplate";
import { toast } from "sonner";
import { useCommTemplates, useCreateCommTemplate, useDeleteCommTemplate } from "@/hooks/useCommTemplates";
import type { CommTemplate } from "@/hooks/useCommTemplates";

const TYPE_LABELS: Record<CommTemplateType, string> = {
  rejection: "Rejection",
  invite: "Interview Invite",
  followup: "Follow-up",
  offer: "Offer",
};

const TYPE_COLORS: Record<CommTemplateType, string> = {
  rejection: "bg-red-100 text-red-700 border-red-200",
  invite: "bg-blue-100 text-blue-700 border-blue-200",
  followup: "bg-amber-100 text-amber-700 border-amber-200",
  offer: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function CommTemplatesPage() {
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
    document.title = "Communication Templates · MPLOYEDIN";
  }, []);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createMutation.mutateAsync(formData);
      setFormData({ name: "", type: "rejection", subject: "", body: "" });
      setShowForm(false);
    } catch (err: unknown) {
      toast.error("Error creating template: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId: string, templateName: string) {
    const ok = await confirmDialog(`Delete template "${templateName}"?`);
    if (!ok) return;

    try {
      await deleteMutation.mutateAsync(templateId);
    } catch {
      toast.error("Error deleting template");
    }
  }

  const filteredTemplates = filterType === "all"
    ? templates
    : templates.filter((t) => t.type === filterType);

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}
      <PageHeader
        title="Communication Templates"
        description="Pre-written templates for rejection emails, interview invites, follow-ups, and offers"
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Template
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "rejection", "invite", "followup", "offer"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t === "all" ? "all" : t)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t === "all" ? "All Templates" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* New Template Form */}
      {showForm && (
        <div className="border rounded-lg p-6 bg-card space-y-4">
          <h3 className="font-semibold text-lg">Create New Template</h3>
          <form onSubmit={handleCreateTemplate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Template Name</label>
              <Input
                placeholder="e.g., Standard Rejection"
                maxLength={100}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Template Type</label>
              <select
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as CommTemplateType })
                }
              >
                <option value="rejection">Rejection</option>
                <option value="invite">Interview Invite</option>
                <option value="followup">Follow-up</option>
                <option value="offer">Offer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email Subject</label>
              <Input
                placeholder="e.g., Application Status Update"
                maxLength={200}
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email Body</label>
              <p className="text-xs text-muted-foreground mb-2">
                Supported placeholders: {"{"}candidateName{"}"}, {"{"}jobTitle{"}"}, {"{"}companyName{"}"}
              </p>
              <textarea
                placeholder={`Dear {{candidateName}},\n\nThank you for your interest in the {{jobTitle}} position at {{companyName}}...`}
                maxLength={5000}
                rows={8}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.body.length} / 5000 characters
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
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No templates yet. Create your first template to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <div key={template._id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-foreground truncate">{template.name}</h3>
                  <Badge className={`w-fit ${TYPE_COLORS[template.type]}`}>
                    {TYPE_LABELS[template.type]}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground uppercase">Subject:</p>
                  <p className="text-foreground font-medium truncate">{template.subject}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground uppercase">Preview:</p>
                  <p className="text-foreground text-sm line-clamp-3">{template.body}</p>
                </div>
              </div>

              {template.isDefault && (
                <div className="text-xs bg-emerald-50 text-emerald-700 rounded px-2 py-1 w-fit">
                  Default Template
                </div>
              )}

              <button
                onClick={() => handleDeleteTemplate(template._id, template.name)}
                className="w-full mt-2 px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
