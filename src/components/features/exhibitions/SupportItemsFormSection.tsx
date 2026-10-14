"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SupportItemFormInput } from "@/lib/exhibitions/agent-request";
import { SUPPORT_ITEM_TYPES, type SupportItemType } from "@/lib/exhibitions/supportItems";

interface SupportItemsFormSectionProps {
  supportItems: SupportItemFormInput[];
  additionalRequirements: string;
  onSupportItemsChange: (items: SupportItemFormInput[]) => void;
  onAdditionalRequirementsChange: (value: string) => void;
  /** Portal container for the item picker (the dialog content). */
  container?: HTMLElement | null;
}

const ITEM_LABEL_KEYS: Record<SupportItemType, string> = {
  tv: "itemTv",
  rollup_banner: "itemRollupBanner",
  visiting_cards: "itemVisitingCards",
  volunteers: "itemVolunteers",
  other: "itemOther",
};

/**
 * "Support and inventory required" on the agent's exhibition request: tick
 * what the event needs (TV, roll-up banner, visiting cards, volunteers, other)
 * and say how many. These are requests only — an admin allocates them later.
 */
export function SupportItemsFormSection({
  supportItems,
  additionalRequirements,
  onSupportItemsChange,
  onAdditionalRequirementsChange,
  container,
}: SupportItemsFormSectionProps) {
  const t = useTranslations("exhibitions");

  const find = (type: SupportItemType) => supportItems.find((entry) => entry.item === type);

  // Keeps quantities already typed for items that stay chosen.
  const choose = (types: string[]) => {
    onSupportItemsChange(
      SUPPORT_ITEM_TYPES.filter((type) => types.includes(type)).map(
        (type) => find(type) ?? { item: type, requestedQty: "" },
      ),
    );
  };
  const remove = (type: SupportItemType) => onSupportItemsChange(supportItems.filter((entry) => entry.item !== type));

  const update = (type: SupportItemType, patch: Partial<SupportItemFormInput>) => {
    onSupportItemsChange(supportItems.map((entry) => (entry.item === type ? { ...entry, ...patch } : entry)));
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        {t("supportAndInventory")}{" "}
        <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
      </legend>

      {/* Pick the items from a menu; only what was picked takes a row, with its
          quantity on the right — five empty tiles made this step scroll. */}
      <MultiSelect
        id="support-items-picker"
        options={SUPPORT_ITEM_TYPES.map((type) => ({ value: type, label: t(ITEM_LABEL_KEYS[type]) }))}
        values={supportItems.map((entry) => entry.item)}
        onValuesChange={choose}
        placeholder={t("supportPickPlaceholder")}
        ariaLabel={t("supportAndInventory")}
        container={container}
        modal
      />

      {supportItems.length > 0 && (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
          {SUPPORT_ITEM_TYPES.filter((type) => find(type)).map((type) => {
            const entry = find(type)!;
            const name = t(ITEM_LABEL_KEYS[type]);
            return (
              <li key={type} className="flex min-h-12 items-center gap-2 bg-card px-3 py-1.5">
                <span className="shrink-0 text-sm">{name}</span>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  {type === "other" && (
                    <Input
                      id="support-other-label"
                      aria-label={t("supportOtherLabel")}
                      value={entry.label ?? ""}
                      maxLength={120}
                      onChange={(event) => update(type, { label: event.target.value })}
                      placeholder={t("supportOtherPlaceholder")}
                      className="h-9 min-w-0 flex-1"
                    />
                  )}
                  <Input
                    id={`support-${type}-qty`}
                    aria-label={`${name}: ${type === "volunteers" ? t("supportPeopleNeeded") : t("quantity")}`}
                    type="text"
                    inputMode="numeric"
                    value={String(entry.requestedQty ?? "")}
                    onChange={(event) => update(type, { requestedQty: event.target.value.replace(/\D/g, "").slice(0, 6) })}
                    placeholder={type === "volunteers" ? t("supportPeopleShort") : t("quantity")}
                    className="h-9 w-24 shrink-0 text-end tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                    aria-label={`${t("removeItem")} ${name}`}
                    onClick={() => remove(type)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pt-2">
        <Label htmlFor="support-additional">
          {t("additionalRequirements")} <span className="text-xs font-normal text-muted-foreground">({t("optional")})</span>
        </Label>
        <Textarea
          id="support-additional"
          value={additionalRequirements}
          maxLength={2000}
          rows={2}
          onChange={(event) => onAdditionalRequirementsChange(event.target.value)}
          placeholder={t("additionalRequirementsPlaceholder")}
        />
      </div>
    </fieldset>
  );
}

/** The error key for the first invalid line, or null — checked before submit. */
export function supportItemsFormError(items: SupportItemFormInput[]): string | null {
  for (const entry of items) {
    const qty = Number(entry.requestedQty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return "supportQtyInvalid";
    if (entry.item === "other" && !entry.label?.trim()) return "supportOtherLabelRequired";
  }
  return null;
}

/** Only what an agent may send — never allocation or delivery fields. */
export function supportItemsPayload(items: SupportItemFormInput[]) {
  return items.map((entry) => ({
    item: entry.item,
    requestedQty: Number(entry.requestedQty),
    ...(entry.item === "other" ? { label: entry.label?.trim() } : {}),
  }));
}
