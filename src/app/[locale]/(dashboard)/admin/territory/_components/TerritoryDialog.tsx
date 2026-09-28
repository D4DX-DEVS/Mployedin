"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import type { TerritoryRow, TerritorySuperAgentOption } from "@/lib/superAgent/territories";

export interface TerritoryFormValues {
  name: string;
  superAgentId: string;
  cityIds: string[];
  stateIds: string[];
}

interface TerritoryDialogProps {
  open: boolean;
  /** The row being edited; null creates a new territory. */
  row: TerritoryRow | null;
  superAgents: TerritorySuperAgentOption[];
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TerritoryFormValues) => void;
}

type FieldErrors = Partial<Record<"name" | "superAgentId" | "region", string>>;

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="text-xs font-medium text-destructive">{message}</p>;
}

/**
 * Create or edit a territory: a name, the super agent it belongs to, and the
 * places it covers, picked country → state → city from Master Data. The places
 * are saved to the super agent's own region — what their screens show and
 * what scopes their agents and leads.
 */
export function TerritoryDialog({ open, row, superAgents, saving, error, onOpenChange, onSubmit }: TerritoryDialogProps) {
  const t = useTranslations("adminTerritory");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [superAgentId, setSuperAgentId] = useState("");
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [stateIds, setStateIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setSuperAgentId(row?.superAgent?.userId ?? "");
    setCityIds(row?.cityIds ?? []);
    setStateIds(row?.stateIds ?? []);
    setErrors({});
  }, [open, row]);

  const originalOwner = row?.superAgent?.userId ?? "";
  // One territory per super agent: offer those without one, plus this row's own.
  const options = useMemo(
    () =>
      superAgents
        .filter((sa) => !sa.territoryId || sa.territoryId === row?.territoryId)
        .map((sa) => ({ value: sa.userId, label: sa.email ? `${sa.name} (${sa.email})` : sa.name })),
    [superAgents, row?.territoryId],
  );

  const pickSuperAgent = (userId: string) => {
    setSuperAgentId(userId);
    setErrors((prev) => ({ ...prev, superAgentId: undefined }));
    // A new territory for someone who already holds places starts from those,
    // so naming an existing region does not wipe it.
    if (!row && cityIds.length === 0 && stateIds.length === 0) {
      const picked = superAgents.find((sa) => sa.userId === userId);
      if (picked) {
        setCityIds(picked.cityIds);
        setStateIds(picked.stateIds);
      }
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t("errorNameRequired");
    if (!superAgentId) next.superAgentId = t("errorSuperAgentRequired");
    if (cityIds.length + stateIds.length === 0) next.region = t("errorRegionRequired");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ name: name.trim(), superAgentId, cityIds, stateIds });
  };

  const handingOver = Boolean(row && originalOwner && superAgentId && superAgentId !== originalOwner);
  const title = !row ? t("createTerritoryFormHeading") : row.territoryId ? t("editDialogTitle") : t("nameDialogTitle");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent ref={setContainer} className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="territory-name">{t("territoryNameLabel")}</Label>
            <Input
              id="territory-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: undefined })); }}
              placeholder={t("territoryNamePlaceholder")}
              maxLength={100}
              aria-invalid={Boolean(errors.name)}
              className="h-10"
            />
            <FieldError message={errors.name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="territory-super-agent">{t("superAgentLabel")}</Label>
            <SearchableSelect
              id="territory-super-agent"
              options={options}
              value={superAgentId}
              onValueChange={pickSuperAgent}
              placeholder={t("superAgentPlaceholder")}
              ariaLabel={t("superAgentLabel")}
              emptyMessage={t("superAgentEmpty")}
              container={container}
              modal
            />
            <FieldError message={errors.superAgentId} />
            <p className="text-xs text-muted-foreground">
              {handingOver ? t("handOverHint") : t("superAgentHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <CascadingLocationPicker
              selectedCityIds={cityIds}
              selectedStateIds={stateIds}
              onChange={(cities, states) => {
                setCityIds(cities);
                setStateIds(states);
                setErrors((prev) => ({ ...prev, region: undefined }));
              }}
              label={t("regionLabel")}
              error={errors.region}
              alwaysOpen
            />
          </div>

          <FieldError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("cancelButtonLabel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? t("savingButtonText") : row ? t("saveButtonText") : t("createButtonText")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
