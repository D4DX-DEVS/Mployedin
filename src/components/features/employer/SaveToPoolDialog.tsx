"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Loader2 } from "lucide-react";
import { useTalentPools, useCreatePool, useAddCandidateToPool } from "@/hooks/useTalentPools";

const CREATE_NEW = "__create_new__";

interface SaveToPoolDialogProps {
  candidateId: string | null;
  candidateName?: string;
  /** When provided (non-empty), the dialog saves all of these candidates at once (bulk mode). */
  candidateIds?: string[];
  /** Optional source application to record provenance on the pooled candidate. */
  sourceApplicationId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SaveToPoolDialog({
  candidateId,
  candidateName,
  candidateIds,
  sourceApplicationId,
  open,
  onOpenChange,
}: SaveToPoolDialogProps) {
  const t = useTranslations("talentPool");
  const { data: pools = [], isLoading } = useTalentPools();
  const createPool = useCreatePool();
  const addCandidate = useAddCandidateToPool();

  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bulkIds = candidateIds ?? [];
  const isBulk = bulkIds.length > 0;
  const targetIds = isBulk ? bulkIds : candidateId ? [candidateId] : [];

  const isCreating = selected === CREATE_NEW || (!isLoading && pools.length === 0);
  const busy = submitting || createPool.isPending || addCandidate.isPending;

  function reset() {
    setSelected("");
    setNewName("");
  }

  async function resolvePoolId(): Promise<string | null> {
    if (isCreating) {
      const name = newName.trim();
      if (!name) {
        toast.error(t("nameRequired"));
        return null;
      }
      const res = await createPool.mutateAsync({ name });
      return res.pool._id;
    }
    if (!selected || selected === CREATE_NEW) {
      toast.error(t("selectPool"));
      return null;
    }
    return selected;
  }

  async function handleSave() {
    if (targetIds.length === 0) return;
    setSubmitting(true);
    try {
      const poolId = await resolvePoolId();
      if (!poolId) return;

      if (!isBulk) {
        await addCandidate.mutateAsync({ poolId, jobSeekerId: targetIds[0], source: "manual", sourceApplicationId });
        toast.success(t("addedToPool"));
        reset();
        onOpenChange(false);
        return;
      }

      // Bulk: add every selected candidate, tolerating "already in pool" (409).
      const results = await Promise.allSettled(
        targetIds.map((id) => addCandidate.mutateAsync({ poolId, jobSeekerId: id, source: "manual" }))
      );
      let added = 0;
      let skipped = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") {
          added++;
        } else if ((r.reason as { status?: number } | undefined)?.status === 409) {
          skipped++;
        } else {
          failed++;
        }
      }

      if (added > 0 && skipped === 0 && failed === 0) {
        toast.success(t("bulkAddedToPool", { count: added }));
      } else if (added > 0) {
        toast.success(t("bulkAddedPartial", { added, skipped: skipped + failed }));
      } else if (skipped > 0 && failed === 0) {
        toast(t("bulkAlreadyInPool"));
      } else {
        toast.error(t("bulkAddFailed"));
      }

      if (added > 0 || skipped > 0) {
        reset();
        onOpenChange(false);
      }
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 409) toast.error(t("alreadyInPool"));
      else toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" /> {t("saveToPool")}
          </DialogTitle>
          {isBulk ? (
            <DialogDescription>{t("candidatesSelected", { count: bulkIds.length })}</DialogDescription>
          ) : candidateName ? (
            <DialogDescription>{candidateName}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{t("saveToPool")}</DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {pools.length > 0 ? (
              <div className="space-y-1.5">
                <Label>{t("selectPool")}</Label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectPool")} />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={CREATE_NEW}>{t("createNewPool")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {isCreating ? (
              <div className="space-y-1.5">
                <Label htmlFor="save-to-pool-new-name">{t("poolName")}</Label>
                <Input
                  id="save-to-pool-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("poolNamePlaceholder")}
                  maxLength={100}
                />
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={busy || targetIds.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
