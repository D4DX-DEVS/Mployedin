"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeekerAreaField, areaCountryName, type SeekerAreaValue } from "./SeekerAreaField";

/**
 * The job seeker's area on their profile page (client report 2026-09-30, #5):
 * one line saying where they are, and a dialog to pick or change the city.
 * Agents whose territory covers it can then see the profile, unless it is
 * hidden.
 */

interface SavedArea {
  cityId: string;
  cityName: string;
  countryCode: string;
}

interface SeekerAreaCardProps {
  /** Called after a save, so the page can refresh the location it shows. */
  onSaved?: () => void;
}

export function SeekerAreaCard({ onSaved }: SeekerAreaCardProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  // undefined while loading; null when the seeker has not picked an area.
  const [area, setArea] = useState<SavedArea | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SeekerAreaValue>({ countryCode: "", city: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/job-seekers/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: { area?: SavedArea | null } } | null) => { if (live) setArea(data?.profile?.area ?? null); })
      .catch(() => { if (live) setArea(null); });
    return () => { live = false; };
  }, []);

  const openDialog = () => {
    setDraft(area ? { countryCode: area.countryCode, city: { id: area.cityId, name: area.cityName } } : { countryCode: "", city: null });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!draft.city) {
      setError(t("seekerArea.pickCity"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/job-seekers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: draft.city.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { area?: SavedArea | null };
      setArea(data.area ?? null);
      setOpen(false);
      toast.success(t("seekerArea.saved"));
      onSaved?.();
    } catch {
      toast.error(t("seekerArea.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const place = area ? `${area.cityName}, ${areaCountryName(area.countryCode, locale)}` : "";

  return (
    <>
      <div className="card-base flex items-center justify-between gap-3 px-4 py-2.5 text-sm" aria-busy={area === undefined}>
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {area === undefined ? (
            <span className="h-4 w-40 animate-pulse rounded bg-muted" />
          ) : area ? (
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{t("seekerArea.title")}: </span>
              <span className="font-medium text-foreground">{place}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("seekerArea.notSet")}</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 rounded-xl sm:min-h-8"
          onClick={openDialog}
          disabled={area === undefined}
        >
          {area ? t("seekerArea.change") : t("seekerArea.add")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent ref={setContainer} className="overflow-visible sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("seekerArea.title")}</DialogTitle>
            <DialogDescription>{t("seekerArea.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <SeekerAreaField
            value={draft}
            onChange={(next) => { setDraft(next); setError(""); }}
            error={error}
            container={container}
            modal
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t("cancel")}</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
