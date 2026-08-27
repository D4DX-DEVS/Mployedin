"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, BookmarkPlus, Search, Briefcase, TrendingUp } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { csrfFetch } from "@/lib/security/csrf-client";

interface SaveSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current free-text query from the feed search box. */
  query: string;
  /** Single selected experience level, if exactly one is active ("" otherwise). */
  experienceLevel?: string;
  /** Single selected work type (remote/onsite), if exactly one is active. */
  workType?: string;
  locale: string;
}

/**
 * "Save search" flow launched from the jobs feed. Pre-fills the current search
 * criteria, lets the user pick an alert frequency, and posts to the existing
 * saved-searches API (which enforces duplicate prevention server-side).
 */
export function SaveSearchDialog({
  open,
  onOpenChange,
  query,
  experienceLevel = "",
  workType = "",
  locale,
}: SaveSearchDialogProps) {
  const t = useTranslations("jobFeed.saveSearch");
  const router = useRouter();
  const [name, setName] = useState("");
  // Radix Select forbids an empty-string item value, so "any" is the sentinel
  // for "no experience filter" and is mapped back to undefined on save.
  const [exp, setExp] = useState(experienceLevel || "any");
  const [frequency, setFrequency] = useState("weekly");
  const [saving, setSaving] = useState(false);

  const trimmedQuery = query.trim();

  // Re-prefill each time the dialog opens with the latest feed criteria.
  useEffect(() => {
    if (open) {
      setName(trimmedQuery);
      setExp(experienceLevel || "any");
      setFrequency("weekly");
    }
  }, [open, trimmedQuery, experienceLevel]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !trimmedQuery) {
      toast.error(t("required"));
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/user/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          query: trimmedQuery,
          filters: {
            experienceLevel: exp !== "any" ? exp : undefined,
            jobType: workType || undefined,
          },
          frequency,
          emailAlert: frequency !== "never",
        }),
      });

      if (res.status === 409) {
        toast.info(t("duplicate"));
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data?.error || t("failed"));
        return;
      }

      toast.success(t("created"), {
        action: {
          label: t("viewSaved"),
          onClick: () => router.push(`/${locale}/job-seeker/saved-searches`),
        },
      });
      onOpenChange(false);
    } catch {
      toast.error(t("failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Criteria being saved */}
          <div className="rounded-xl border border-border/60 bg-muted/30 text-xs text-muted-foreground chip-pad">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Search className="h-3.5 w-3.5" /> {trimmedQuery || t("noKeyword")}
              </span>
              {workType ? (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> {t(`workType.${workType}`)}
                </span>
              ) : null}
              {exp !== "any" ? (
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> {t(`experience.${exp}`)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="save-search-name" className="text-xs font-medium text-foreground">
              {t("nameLabel")}
            </label>
            <Input
              id="save-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="save-search-exp" className="text-xs font-medium text-foreground">
                {t("experienceLabel")}
              </label>
              <Select value={exp} onValueChange={setExp}>
                <SelectTrigger id="save-search-exp">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("experience.any")}</SelectItem>
                  <SelectItem value="entry">{t("experience.entry")}</SelectItem>
                  <SelectItem value="mid">{t("experience.mid")}</SelectItem>
                  <SelectItem value="senior">{t("experience.senior")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="save-search-freq" className="text-xs font-medium text-foreground">
                {t("frequencyLabel")}
              </label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="save-search-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("frequency.daily")}</SelectItem>
                  <SelectItem value="weekly">{t("frequency.weekly")}</SelectItem>
                  <SelectItem value="never">{t("frequency.never")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !trimmedQuery}>
            {saving ? (
              <Loader2 className="me-1 h-4 w-4 animate-spin" />
            ) : (
              <BookmarkPlus className="me-1 h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
