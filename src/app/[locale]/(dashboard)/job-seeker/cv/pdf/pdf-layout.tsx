/* ── Layout controls for the PDF templates ──
   PDF twin of the CvLayoutContext pieces in ../templates.tsx: the same
   choices (header alignment, justified text, heading style, skills style,
   name size, bullets, date position, photo shape) drawn with react-pdf. */

import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { CvLayout, FormattingOptions } from "../types";
import {
  DEFAULT_CV_LAYOUT, DEFAULT_FORMATTING, getBulletChar, getCvLayout, getFontScale,
  getNameScale, getPhotoRadius, pickAuto,
} from "../types";

const PdfLayoutContext = React.createContext<{ layout: CvLayout; formatting: FormattingOptions }>({
  layout: DEFAULT_CV_LAYOUT,
  formatting: DEFAULT_FORMATTING,
});

export function PdfLayoutProvider({ formatting, children }: { formatting: FormattingOptions; children: React.ReactNode }) {
  return (
    <PdfLayoutContext.Provider value={{ layout: getCvLayout(formatting), formatting }}>
      {children}
    </PdfLayoutContext.Provider>
  );
}

export function usePdfLayout() {
  return React.useContext(PdfLayoutContext);
}

/** Template's own header alignment unless the seeker picked one. */
export function headerAlignOf(formatting: FormattingOptions, templateDefault: "left" | "center"): "left" | "center" {
  return pickAuto(getCvLayout(formatting).headerAlign, templateDefault);
}

/** Name size in pt: template size x font scale x Name size (same as the HTML's px). */
export function nameSizeOf(formatting: FormattingOptions, base: number): number {
  return base * getFontScale(formatting) * getNameScale(formatting);
}

/** Corner radius for a photo of `size` (circle / rounded / square). */
export function photoRadiusOf(formatting: FormattingOptions, size: number): number {
  return getPhotoRadius(formatting, size);
}

/** Date placement for an entry: the template's own, unless the seeker picked one. */
export function datePositionOf(formatting: FormattingOptions, templateDefault: "right" | "below"): "right" | "below" {
  return pickAuto(getCvLayout(formatting).datePosition, templateDefault);
}

/** Bullet glyph for lists (•, – or ›). */
export function bulletOf(formatting: FormattingOptions): string {
  return getBulletChar(formatting);
}

/**
 * Heading look: the template's own `variant`, or the seeker's Heading style.
 * Returns the style bits to merge into the template's heading Text.
 */
export function headingLook(formatting: FormattingOptions, variant: "underline" | "plain" | "band", color: string, rule: string): Style {
  const choice = pickAuto(getCvLayout(formatting).headingStyle, variant);
  if (choice === "band") {
    return { color: "#ffffff", backgroundColor: color, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2, borderBottomWidth: 0 };
  }
  if (choice === "plain") return { color, borderBottomWidth: 0 };
  return { color, borderBottomWidth: 1.5, borderBottomColor: rule };
}

/** PDF twin of EntryRow: title block with the date on the right or underneath. */
export function PdfEntryRow({
  children, date, templateDefault = "right", align = "start", style,
}: {
  children: React.ReactNode;
  date: React.ReactNode;
  templateDefault?: "right" | "below";
  align?: "start" | "end";
  style?: Style;
}) {
  const { formatting } = usePdfLayout();
  const position = datePositionOf(formatting, templateDefault);
  if (position === "below" || !date) {
    return (
      <View style={style}>
        {children}
        {date ?? null}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: align === "end" ? "flex-end" : "flex-start", gap: 8, ...(style as object) }}>
      <View style={{ flexShrink: 1 }}>{children}</View>
      {date}
    </View>
  );
}

/** PDF twin of SkillList: chips (template's own), comma list or bullet columns. */
export function PdfSkillList({
  skills, chip, fontSize, color = "#374151", columns = 3, chipGap = 4, templateDefault = "chips", separator = ", ", style,
}: {
  skills: string[];
  chip: (skill: string, index: number) => React.ReactNode;
  fontSize: number;
  color?: string;
  columns?: number;
  chipGap?: number;
  templateDefault?: "chips" | "comma" | "columns";
  /** Joiner for the template's own list look (e.g. " · "); an explicit Comma list uses ", ". */
  separator?: string;
  /** Extra text style for the list line (e.g. centred). */
  style?: Style;
}) {
  const { layout, formatting } = usePdfLayout();
  const choice = pickAuto(layout.skillsStyle, templateDefault);
  if (choice === "comma") {
    return <Text style={{ fontSize, color, ...(style as object) }}>{skills.join(layout.skillsStyle === "auto" ? separator : ", ")}</Text>;
  }
  if (choice === "columns") {
    const bullet = getBulletChar(formatting);
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 2 }}>
        {skills.map((s, i) => (
          <View key={i} style={{ width: `${100 / columns}%`, flexDirection: "row", gap: 3, paddingRight: 6 }}>
            <Text style={{ fontSize, color }}>{bullet}</Text>
            <Text style={{ fontSize, color, flexShrink: 1 }}>{s}</Text>
          </View>
        ))}
      </View>
    );
  }
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: chipGap }}>{skills.map((s, i) => <React.Fragment key={i}>{chip(s, i)}</React.Fragment>)}</View>;
}
