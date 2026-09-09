"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bookmark, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export interface SavedViewsMenuProps {
  presets: { key: string; label: string; query: string }[];
  views: { id: string; name: string; query: string }[];
  activeQuery: string;
  onApply: (query: string) => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canSave: boolean;
  isLoading?: boolean;
}

export function SavedViewsMenu({
  presets,
  views,
  activeQuery,
  onApply,
  onSave,
  onDelete,
  canSave,
  isLoading,
}: SavedViewsMenuProps) {
  const t = useTranslations("employerJobWorkspace");
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isActive = presets.some((p) => p.query === activeQuery) || views.some((v) => v.query === activeQuery);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaveLoading(true);
    try {
      await onSave(saveName.trim());
      toast.success(t("viewSaved"));
      setSaveDialogOpen(false);
      setSaveName("");
    } catch {
      toast.error(t("toastViewSaveError"));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      await onDelete(deleteConfirm.id);
      toast.success(t("viewDeleted"));
      setDeleteConfirm(null);
    } catch {
      toast.error(t("toastViewDeleteError"));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="inline-flex min-h-11 rounded-xl sm:min-h-10"
            aria-label={t("viewsButton")}
            aria-pressed={isActive || undefined}
            disabled={isLoading}
          >
            <Bookmark className="h-4 w-4 sm:me-2" aria-hidden />
            <span className="hidden sm:inline">{t("viewsButton")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Presets */}
          {presets.length > 0 && (
            <DropdownMenuGroup>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("viewsPresets")}</div>
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.key}
                  onClick={() => {
                    onApply(preset.query);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={`h-4 w-4 me-2 ${preset.query === activeQuery ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}

          {/* Saved views */}
          {views.length > 0 && (
            <>
              {presets.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("viewsMine")}</div>
                {views.map((view) => (
                  <div key={view.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent rounded">
                    <button
                      onClick={() => {
                        onApply(view.query);
                        setOpen(false);
                      }}
                      className="flex-1 text-left text-sm cursor-pointer hover:text-foreground text-muted-foreground"
                    >
                      <Check className={`h-4 w-4 inline me-2 ${view.query === activeQuery ? "opacity-100" : "opacity-0"}`} aria-hidden />
                      {view.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      aria-label={t("deleteView")}
                      onClick={() => setDeleteConfirm({ id: view.id, name: view.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                ))}
              </DropdownMenuGroup>
            </>
          )}

          {/* Empty state */}
          {views.length === 0 && presets.length === 0 && (
            <>
              {presets.length > 0 && <DropdownMenuSeparator />}
              <div className="px-2 py-2 text-xs text-muted-foreground text-center">{t("viewsEmpty")}</div>
            </>
          )}

          {/* Save current view */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canSave || isLoading}
            onClick={() => setSaveDialogOpen(true)}
            className="cursor-pointer"
            title={!canSave ? t("viewLimitReached") : undefined}
          >
            {t("saveCurrentView")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent mobileSheet>
          <DialogHeader>
            <DialogTitle>{t("saveViewTitle")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="save-view-name">{t("saveViewNameLabel")}</Label>
              <Input
                id="save-view-name"
                placeholder={t("saveViewNamePlaceholder")}
                maxLength={40}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                disabled={saveLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={saveLoading}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={!saveName.trim() || saveLoading}>
              {saveLoading ? t("savingButton") : t("saveViewButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent mobileSheet>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteView", { name: deleteConfirm?.name ?? "" })}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleteLoading}>
              {deleteLoading ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
