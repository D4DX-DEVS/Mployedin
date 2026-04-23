"use client";

import { useCallback } from "react";
import { Eye, EyeOff, GripVertical, Layers3, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { TextZone, ZoneDisplayStyle } from "@/hooks/usePosterTemplates";

const ZONE_FIELDS = [
  "title",
  "tagline",
  "company",
  "location",
  "salary",
  "skills",
  "cta",
  "qr",
  "logo",
  "experience",
  "workMode",
  "watermark",
] as const;

const ZONE_LABELS: Record<string, string> = {
  title: "Title",
  tagline: "Tagline",
  company: "Company",
  location: "Location",
  salary: "Salary",
  skills: "Skills",
  cta: "CTA",
  qr: "QR Code",
  logo: "Logo",
  experience: "Experience",
  workMode: "Work Mode",
  watermark: "Watermark",
};

const DISPLAY_STYLES: { value: ZoneDisplayStyle; label: string }[] = [
  { value: "plain", label: "Plain text" },
  { value: "pill", label: "Pill / Tag" },
  { value: "card", label: "Info card" },
  { value: "button", label: "Button" },
  { value: "badge", label: "Badge" },
];

/** Recommended display style per field type */
const FIELD_DEFAULT_STYLE: Record<string, ZoneDisplayStyle> = {
  title: "plain",
  tagline: "plain",
  company: "badge",
  location: "card",
  salary: "card",
  skills: "pill",
  cta: "button",
  experience: "card",
  workMode: "card",
  watermark: "plain",
  qr: "plain",
  logo: "plain",
};

const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function makeId() {
  return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_ZONE: Omit<TextZone, "id" | "field"> = {
  x: 10,
  y: 10,
  w: 30,
  h: 8,
  fontSize: 16,
  fontWeight: 600,
  color: "#FFFFFF",
  align: "left",
  visible: true,
  displayStyle: "plain",
  bgColor: "",
  borderRadius: 0,
  padding: 0,
};

interface Props {
  zones: TextZone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onSetZones: (zones: TextZone[]) => void;
}

export default function PosterZoneEditor({
  zones,
  selectedZoneId,
  onSelectZone,
  onSetZones,
}: Props) {
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId);
  const selectedZoneLabel = selectedZone
    ? ZONE_LABELS[selectedZone.field] ?? selectedZone.field
    : null;

  const updateZone = useCallback(
    (id: string, update: Partial<TextZone>) => {
      onSetZones(zones.map((zone) => (zone.id === id ? { ...zone, ...update } : zone)));
    },
    [zones, onSetZones]
  );

  const addZone = useCallback(
    (field: string) => {
      const style = FIELD_DEFAULT_STYLE[field] ?? "plain";
      const newZone: TextZone = {
        ...DEFAULT_ZONE,
        id: makeId(),
        field,
        y: 10 + zones.length * 10,
        displayStyle: style,
        bgColor: style === "card" ? "#f8fafc" : style === "button" ? "#6366F1" : style === "badge" ? "#6366F1" : "",
        borderRadius: style === "pill" ? 20 : style === "button" ? 12 : style === "card" ? 12 : style === "badge" ? 20 : 0,
        padding: style === "card" ? 10 : style === "button" ? 8 : style === "pill" ? 6 : style === "badge" ? 6 : 0,
      };

      onSetZones([...zones, newZone]);
      onSelectZone(newZone.id);
    },
    [zones, onSelectZone, onSetZones]
  );

  const removeZone = useCallback(
    (id: string) => {
      onSetZones(zones.filter((zone) => zone.id !== id));
      if (selectedZoneId === id) {
        onSelectZone(null);
      }
    },
    [zones, onSelectZone, onSetZones, selectedZoneId]
  );

  const usedFields = new Set(zones.map((zone) => zone.field));
  const availableFields = ZONE_FIELDS.filter((field) => !usedFields.has(field));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/70 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Layer manager
            </p>
            <h3 className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
              Text zones
            </h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Add reusable fields, toggle visibility, and select a layer to refine spacing.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-secondary/40 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active layers
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">{zones.length}</p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {zones.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border/70 bg-secondary/30 px-4 py-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
                <Layers3 className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">No zones added yet</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Start with title and company, then add supporting fields like location or CTA.
              </p>
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {zones.map((zone) => {
                const isSelected = zone.id === selectedZoneId;

                return (
                  <div
                    key={zone.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectZone(zone.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectZone(zone.id);
                      }
                    }}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-sky-200 bg-sky-50/70 shadow-[0_16px_28px_-26px_rgba(2,132,199,0.55)]"
                        : "border-border/70 bg-background/80 hover:border-sky-100 hover:bg-secondary/45"
                    }`}
                  >
                    <div className="rounded-xl bg-secondary/70 p-2 text-muted-foreground">
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {ZONE_LABELS[zone.field] ?? zone.field}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {zone.fontSize}px
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        X {zone.x}% · Y {zone.y}% · W {zone.w}% · H {zone.h}%
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateZone(zone.id, { visible: !zone.visible });
                      }}
                      className="rounded-full p-2 text-muted-foreground transition hover:bg-background hover:text-foreground"
                      aria-label={zone.visible ? "Hide zone" : "Show zone"}
                    >
                      {zone.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeZone(zone.id);
                      }}
                      className="rounded-full p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete zone"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {availableFields.length > 0 && (
          <Select onValueChange={(value) => addZone(value)}>
            <SelectTrigger className="mt-3 h-10 rounded-2xl border-border bg-background text-sm shadow-none">
              <div className="flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />
                <SelectValue placeholder="Add zone..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              {availableFields.map((field) => (
                <SelectItem key={field} value={field} className="text-sm">
                  {ZONE_LABELS[field] ?? field}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedZone ? (
        <div className="flex-1 space-y-3 overflow-y-auto p-3.5 sm:p-4">
          <div className="rounded-[22px] border border-border/70 bg-background/80 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Selected zone
            </p>
            <h4 className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
              {selectedZoneLabel}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust position, scale, and text treatment while watching the live poster preview.
            </p>
          </div>

          <div className="rounded-[22px] border border-border/70 bg-background/80 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Position and size
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">X (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={2}
                  value={selectedZone.x}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      x: clamp(Number(e.target.value) || 0, 0, Math.max(0, 100 - selectedZone.w)),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Y (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={2}
                  value={selectedZone.y}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      y: clamp(Number(e.target.value) || 0, 0, Math.max(0, 100 - selectedZone.h)),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Width (%)</Label>
                <Input
                  type="number"
                  min={4}
                  max={100}
                  step={2}
                  value={selectedZone.w}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      w: clamp(Number(e.target.value) || 4, 4, Math.max(4, 100 - selectedZone.x)),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Height (%)</Label>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  step={2}
                  value={selectedZone.h}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      h: clamp(Number(e.target.value) || 2, 2, Math.max(2, 100 - selectedZone.y)),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-border/70 bg-background/80 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Text styling
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Font size</Label>
                <Input
                  type="number"
                  min={8}
                  max={72}
                  value={selectedZone.fontSize}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      fontSize: clamp(Number(e.target.value) || 8, 8, 72),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Font weight</Label>
                <Select
                  value={String(selectedZone.fontWeight)}
                  onValueChange={(value) =>
                    updateZone(selectedZone.id, { fontWeight: Number(value) })
                  }
                >
                  <SelectTrigger className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_WEIGHTS.map((fontWeight) => (
                      <SelectItem key={fontWeight} value={String(fontWeight)} className="text-sm">
                        {fontWeight}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Color</Label>
                <div className="mt-1 flex h-9 items-center gap-2 rounded-xl border border-border bg-secondary/35 px-2">
                  <input
                    type="color"
                    value={selectedZone.color}
                    onChange={(e) => updateZone(selectedZone.id, { color: e.target.value })}
                    className="h-7 w-7 cursor-pointer rounded-lg border border-border bg-transparent"
                  />
                  <Input
                    value={selectedZone.color}
                    onChange={(e) => updateZone(selectedZone.id, { color: e.target.value })}
                    className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Align</Label>
                <Select
                  value={selectedZone.align}
                  onValueChange={(value) =>
                    updateZone(selectedZone.id, { align: value as "left" | "center" | "right" })
                  }
                >
                  <SelectTrigger className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left" className="text-sm">Left</SelectItem>
                    <SelectItem value="center" className="text-sm">Center</SelectItem>
                    <SelectItem value="right" className="text-sm">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/30 px-3 py-2.5">
              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visible on canvas</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hide a layer temporarily without deleting its saved settings.
                </p>
              </div>
              <Switch
                checked={selectedZone.visible}
                onCheckedChange={(checked) => updateZone(selectedZone.id, { visible: checked })}
              />
            </div>
          </div>

          {/* Visual style section */}
          <div className="rounded-[22px] border border-border/70 bg-background/80 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Visual style
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className="col-span-2">
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Display style</Label>
                <Select
                  value={selectedZone.displayStyle ?? "plain"}
                  onValueChange={(value) =>
                    updateZone(selectedZone.id, { displayStyle: value as ZoneDisplayStyle })
                  }
                >
                  <SelectTrigger className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPLAY_STYLES.map((ds) => (
                      <SelectItem key={ds.value} value={ds.value} className="text-sm">
                        {ds.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bg Color</Label>
                <div className="mt-1 flex h-9 items-center gap-2 rounded-xl border border-border bg-secondary/35 px-2">
                  <input
                    type="color"
                    value={selectedZone.bgColor || "#ffffff"}
                    onChange={(e) => updateZone(selectedZone.id, { bgColor: e.target.value })}
                    className="h-7 w-7 cursor-pointer rounded-lg border border-border bg-transparent"
                  />
                  <Input
                    value={selectedZone.bgColor ?? ""}
                    onChange={(e) => updateZone(selectedZone.id, { bgColor: e.target.value })}
                    placeholder="none"
                    className="h-8 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Radius (px)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={selectedZone.borderRadius ?? 0}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      borderRadius: clamp(Number(e.target.value) || 0, 0, 50),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>

              <div>
                <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Padding (px)</Label>
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={selectedZone.padding ?? 0}
                  onChange={(e) =>
                    updateZone(selectedZone.id, {
                      padding: clamp(Number(e.target.value) || 0, 0, 40),
                    })
                  }
                  className="mt-1 h-9 rounded-xl border-border bg-secondary/35 text-sm shadow-none"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="max-w-[240px] rounded-[22px] border border-dashed border-border/70 bg-secondary/25 px-4 py-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
              <Layers3 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">Select a zone to edit</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Click a zone from the list or canvas to open its sizing and typography controls.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
