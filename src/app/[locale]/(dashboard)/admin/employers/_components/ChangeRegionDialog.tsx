"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { CityPicker, type PickedCity } from "@/components/shared/CityPicker";
import type { EmployerRegionSummary } from "@/lib/agents/territoryCoverage";

interface ChangeRegionDialogProps {
  /** The employer being moved, by USER id (the admin list's row id). */
  employer: { userId: string; companyName: string } | null;
  onClose: () => void;
  /** Called after a successful save with the employer's new region. */
  onChanged: (userId: string, region: EmployerRegionSummary | null) => void;
}

interface CountryOption { code?: string; name: string }

/**
 * Admin: move an employer to another region. Everyone whose territory covers
 * the region sees the company, so this is how an employer changes super-agent.
 * Its jobs and applicants follow (they are scoped through the employer).
 */
export function ChangeRegionDialog({ employer, onClose, onChanged }: ChangeRegionDialogProps) {
  const t = useTranslations("adminEmployers.changeRegion");
  const [current, setCurrent] = useState<EmployerRegionSummary | null>(null);
  const [countries, setCountries] = useState<Array<{ value: string; label: string }>>([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState<PickedCity | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const userId = employer?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const [regionRes, countriesRes] = await Promise.all([
        fetch(`/api/employers/${userId}/region`),
        fetch("/api/filters/locations?level=countries"),
      ]);
      if (!regionRes.ok || !countriesRes.ok) throw new Error("load");
      const regionData = (await regionRes.json()) as { region: EmployerRegionSummary | null };
      const countryData = (await countriesRes.json()) as { countries?: CountryOption[] };
      setCurrent(regionData.region ?? null);
      setCountries(
        (countryData.countries ?? [])
          .filter((c) => c.code)
          .map((c) => ({ value: String(c.code).toUpperCase(), label: c.name })),
      );
      setCountry(regionData.region?.countryCode ?? "AE");
      setCity(null);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  const unchanged = !city || city.id === current?.cityId;

  const handleSave = async () => {
    if (!employer || !city || unchanged) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employers/${employer.userId}/region`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: city.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { region?: EmployerRegionSummary | null };
      if (!res.ok) {
        toast.error(t("saveFailed"));
        return;
      }
      const next = data.region ?? null;
      toast.success(
        next && next.superAgents.length > 0
          ? t("savedCovered", { company: employer.companyName, city: next.cityName, names: next.superAgents.map((s) => s.name).join(", ") })
          : t("savedUncovered", { company: employer.companyName, city: next?.cityName ?? city.name }),
      );
      onChanged(employer.userId, next);
      onClose();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!employer} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      {/* overflow-visible: the pickers portal their lists into this dialog. */}
      <DialogContent ref={setContainer} className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" aria-hidden="true" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description", { company: employer?.companyName ?? "" })}</DialogDescription>
        </DialogHeader>

        {loadFailed ? (
          <ErrorState onRetry={() => void load()} />
        ) : loading ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
            <div className="h-11 animate-pulse rounded-lg bg-muted/40" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("currentLabel")}</p>
              {current ? (
                <div className="text-sm">
                  <p className="text-foreground">{t("cityLine", { city: current.cityName, state: current.stateName, country: current.countryCode })}</p>
                  <p className={current.superAgents.length > 0 ? "text-muted-foreground" : "text-amber-700"}>
                    {current.superAgents.length > 0
                      ? t("seenBy", { names: current.superAgents.map((s) => s.name).join(", ") })
                      : t("noSuperAgent")}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-amber-700">{t("noRegion")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="change-region-country">{t("countryLabel")}</Label>
              <SearchableSelect
                id="change-region-country"
                options={countries}
                value={country}
                onValueChange={(v) => { setCountry(v); setCity(null); }}
                placeholder={t("countryPlaceholder")}
                ariaLabel={t("countryLabel")}
                searchPlaceholder={t("countrySearchPlaceholder")}
                container={container}
                modal
              />
            </div>

            <CityPicker
              countryCode={country}
              value={city}
              onChange={setCity}
              label={t("cityLabel")}
              required
              placeholder={t("cityPlaceholder")}
              searchPlaceholder={t("citySearchPlaceholder")}
              typeToSearchMessage={t("cityTypeToSearch")}
              emptyMessage={t("cityNoMatch")}
              loadingMessage={t("citySearching")}
              hint={t("historyNote")}
              container={container}
              modal
            />

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="max-sm:min-h-11">
                {t("cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || unchanged} className="max-sm:min-h-11">
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
