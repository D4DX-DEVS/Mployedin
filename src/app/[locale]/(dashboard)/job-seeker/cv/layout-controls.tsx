"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { CvLayout, FormattingOptions } from "./types";
import {
  getCvLayout,
  HEADER_ALIGN_OPTIONS, TEXT_ALIGN_OPTIONS, HEADING_STYLE_OPTIONS, SKILLS_STYLE_OPTIONS,
  NAME_SIZE_OPTIONS, BULLET_STYLE_OPTIONS, DATE_POSITION_OPTIONS, PHOTO_SHAPE_OPTIONS,
} from "./types";

interface LayoutControlsProps {
  formatting: FormattingOptions;
  onChange: (f: FormattingOptions) => void;
}

/**
 * Header / text / heading / skills / name / bullet / date / photo controls.
 * Every choice is drawn the same way in the live preview and the PDF;
 * "Template default" keeps the selected template's own look.
 */
export function LayoutControls({ formatting, onChange }: LayoutControlsProps) {
  const t = useTranslations("cvBuilderPage.formatting.layout");
  const layout = getCvLayout(formatting);
  const set = <K extends keyof CvLayout>(key: K, value: CvLayout[K]) => onChange({ ...formatting, [key]: value });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-foreground">{t("title")}</p>
        <p className="text-[0.65rem] text-muted-foreground">{t("hint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LayoutSelect label={t("headerAlign")} value={layout.headerAlign} options={HEADER_ALIGN_OPTIONS}
          optionLabel={(v) => t(`headerAligns.${v}`)} onChange={(v) => set("headerAlign", v)} />
        <LayoutSelect label={t("textAlign")} value={layout.textAlign} options={TEXT_ALIGN_OPTIONS}
          optionLabel={(v) => t(`textAligns.${v}`)} onChange={(v) => set("textAlign", v)} />
        <LayoutSelect label={t("headingStyle")} value={layout.headingStyle} options={HEADING_STYLE_OPTIONS}
          optionLabel={(v) => t(`headingStyles.${v}`)} onChange={(v) => set("headingStyle", v)} />
        <LayoutSelect label={t("skillsStyle")} value={layout.skillsStyle} options={SKILLS_STYLE_OPTIONS}
          optionLabel={(v) => t(`skillsStyles.${v}`)} onChange={(v) => set("skillsStyle", v)} />
        <LayoutSelect label={t("nameSize")} value={layout.nameSize} options={NAME_SIZE_OPTIONS}
          optionLabel={(v) => t(`nameSizes.${v}`)} onChange={(v) => set("nameSize", v)} />
        <LayoutSelect label={t("bulletStyle")} value={layout.bulletStyle} options={BULLET_STYLE_OPTIONS}
          optionLabel={(v) => t(`bulletStyles.${v}`)} onChange={(v) => set("bulletStyle", v)} />
        <LayoutSelect label={t("datePosition")} value={layout.datePosition} options={DATE_POSITION_OPTIONS}
          optionLabel={(v) => t(`datePositions.${v}`)} onChange={(v) => set("datePosition", v)} />
        <LayoutSelect label={t("photoShape")} value={layout.photoShape} options={PHOTO_SHAPE_OPTIONS}
          optionLabel={(v) => t(`photoShapes.${v}`)} onChange={(v) => set("photoShape", v)} />
      </div>
    </div>
  );
}

function LayoutSelect<T extends string>({
  label, value, options, optionLabel, onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (value: T) => string;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs font-medium text-foreground mb-1.5 block">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{optionLabel(o)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
