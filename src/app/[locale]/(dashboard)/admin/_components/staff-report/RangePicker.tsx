"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { presetRange, RANGE_PRESETS } from "@/lib/admin/staffReport/range";
import type { RangePreset, ReportRange } from "@/lib/admin/staffReport/types";

interface RangePickerProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}

/** Quick picks plus a custom from–to range; every number on the page follows it. */
export function RangePicker({ value, onChange }: RangePickerProps) {
  const t = useTranslations("adminStaffReport");
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to);
  useEffect(() => { setFrom(value.from ?? ""); setTo(value.to); }, [value.from, value.to]);

  const pick = (preset: RangePreset) => {
    if (preset === "custom") onChange({ preset, from: value.from, to: value.to });
    else onChange(presetRange(preset));
  };
  const applyCustom = () => {
    if (!to) return;
    const [a, b] = from && from > to ? [to, from] : [from || null, to];
    onChange({ preset: "custom", from: a, to: b });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="report-range" className="shrink-0 text-sm text-muted-foreground">{t("range.label")}</Label>
        <Select value={value.preset} onValueChange={(v) => pick(v as RangePreset)}>
          <SelectTrigger id="report-range" className="min-h-11 w-full bg-background sm:min-h-9 sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => <SelectItem key={p} value={p}>{t(`range.${p}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {value.preset === "custom" && (
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor="report-from" className="w-10 shrink-0 text-sm text-muted-foreground sm:w-auto">{t("range.from")}</Label>
            <Input id="report-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-h-11 bg-background sm:min-h-9" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="report-to" className="w-10 shrink-0 text-sm text-muted-foreground sm:w-auto">{t("range.to")}</Label>
            <Input id="report-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-h-11 bg-background sm:min-h-9" />
          </div>
          <Button type="button" variant="secondary" onClick={applyCustom} disabled={!to} className="min-h-11 sm:min-h-9">
            {t("range.apply")}
          </Button>
        </>
      )}
    </div>
  );
}
