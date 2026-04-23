"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PosterZoneCanvas from "@/components/features/admin/poster-templates/PosterZoneCanvas";
import PosterZoneEditor from "@/components/features/admin/poster-templates/PosterZoneEditor";
import PosterAIAssistant from "@/components/features/admin/poster-templates/PosterAIAssistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreatePosterTemplate } from "@/hooks/usePosterTemplates";
import type { TextZone } from "@/hooks/usePosterTemplates";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ImagePlus,
  Layers3,
  LayoutTemplate,
  Loader2,
  Palette,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

type SizeKey = "landscape" | "square" | "story";
type ZoneStateUpdate = TextZone[] | ((zones: TextZone[]) => TextZone[]);

const SIZE_OPTIONS: Array<{
  key: SizeKey;
  label: string;
  ratio: string;
  description: string;
}> = [
  {
    key: "landscape",
    label: "Landscape",
    ratio: "16:9",
    description: "Best for job boards, horizontal banners, and desktop promos.",
  },
  {
    key: "square",
    label: "Square",
    ratio: "1:1",
    description: "Balanced format for social posts, cards, and carousel slots.",
  },
  {
    key: "story",
    label: "Story",
    ratio: "9:16",
    description: "Tall mobile canvas for stories, reels covers, and status ads.",
  },
];

const CATEGORY_OPTIONS = [
  "corporate",
  "creative",
  "minimal",
  "tech",
  "healthcare",
  "education",
  "other",
] as const;

export default function NewPosterTemplatePage() {
  const router = useRouter();
  const { locale } = useParams();
  const createMutation = useCreatePosterTemplate();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("corporate");
  const [accentColor, setAccentColor] = useState("#6366F1");
  const [activeSize, setActiveSize] = useState<SizeKey>("landscape");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [bgFiles, setBgFiles] = useState<Record<SizeKey, File | null>>({
    landscape: null,
    square: null,
    story: null,
  });
  const [bgPreviews, setBgPreviews] = useState<Record<SizeKey, string>>({
    landscape: "",
    square: "",
    story: "",
  });
  const [allZones, setAllZones] = useState<Record<SizeKey, TextZone[]>>({
    landscape: [],
    square: [],
    story: [],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      Object.values(bgPreviews).forEach((previewUrl) => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
      });
    };
  }, [bgPreviews]);

  const handleBgUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setBgFiles((prev) => ({ ...prev, [activeSize]: file }));
      const nextPreviewUrl = URL.createObjectURL(file);
      setBgPreviews((prev) => {
        const previousPreviewUrl = prev[activeSize];
        if (previousPreviewUrl) {
          URL.revokeObjectURL(previousPreviewUrl);
        }

        return {
          ...prev,
          [activeSize]: nextPreviewUrl,
        };
      });
      event.target.value = "";
      toast.success(
        `${SIZE_OPTIONS.find((option) => option.key === activeSize)?.label ?? "Current"} background loaded.`
      );
    },
    [activeSize]
  );

  const currentZones = allZones[activeSize];

  const setCurrentZones = useCallback(
    (nextZones: ZoneStateUpdate) => {
      setAllZones((prev) => ({
        ...prev,
        [activeSize]:
          typeof nextZones === "function"
            ? nextZones(prev[activeSize])
            : nextZones,
      }));
    },
    [activeSize]
  );

  const handleUpdateZone = useCallback(
    (id: string, update: Partial<TextZone>) => {
      setCurrentZones((zones) =>
        zones.map((zone) => (zone.id === id ? { ...zone, ...update } : zone))
      );
    },
    [setCurrentZones]
  );

  // When switching formats, copy + adapt zones if the target format is empty
  const handleSwitchFormat = useCallback(
    (targetSize: SizeKey) => {
      if (targetSize === activeSize) return;

      setAllZones((prev) => {
        // If target already has zones, just switch — don't overwrite
        if (prev[targetSize].length > 0) return prev;

        // Find source zones: prefer current format, then any non-empty format
        const sourceKey =
          prev[activeSize].length > 0
            ? activeSize
            : SIZE_OPTIONS.find((o) => prev[o.key].length > 0)?.key;

        if (!sourceKey) return prev; // nothing to copy

        const sourceZones = prev[sourceKey];

        // Adapt zones for the new aspect ratio
        const adapted = sourceZones.map((zone) => {
          const z = { ...zone, id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };

          // Landscape→Story or Story→Landscape need bigger adjustments
          const isToTall = targetSize === "story";
          const isToWide = targetSize === "landscape";
          const isFromTall = sourceKey === "story";
          const isFromWide = sourceKey === "landscape";

          if ((isFromWide && isToTall) || (isFromTall && isToWide)) {
            // Major aspect flip: re-stack vertically or horizontally
            if (isToTall) {
              // Going to story (tall): make zones wider, stack vertically
              z.x = Math.min(z.x, 6);
              z.w = Math.min(Math.max(z.w, 70), 88);
              z.align = "center";
            } else {
              // Going to landscape (wide): allow side-by-side
              z.w = Math.min(z.w, 50);
            }
          } else if (targetSize === "square") {
            // Going to square: center align, moderate widths
            z.w = Math.min(Math.max(z.w, 40), 80);
            z.x = Math.max(z.x, 10);
            z.align = "center";
          }

          // Clamp bounds
          z.x = Math.min(z.x, 100 - z.w);
          z.y = Math.min(z.y, 100 - z.h);

          return z;
        });

        return { ...prev, [targetSize]: adapted };
      });

      setActiveSize(targetSize);
      setSelectedZoneId(null);
    },
    [activeSize]
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Template name is required.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("category", category);
    formData.append("defaultAccentColor", accentColor);
    formData.append("textZones", JSON.stringify(allZones));

    for (const option of SIZE_OPTIONS) {
      const file = bgFiles[option.key];
      if (file) {
        formData.append(`bg_${option.key}`, file);
      }
    }

    try {
      await createMutation.mutateAsync(formData);
      toast.success("Poster template created.");
      router.push(`/${locale}/admin/poster-templates`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const activeSizeConfig =
    SIZE_OPTIONS.find((option) => option.key === activeSize) ?? SIZE_OPTIONS[0];

  // Fallback: if active format has no bg, use any uploaded bg so the same
  // image carries across formats until a format-specific one is uploaded.
  const activeBgPreview =
    bgPreviews[activeSize] ||
    bgPreviews.landscape ||
    bgPreviews.square ||
    bgPreviews.story ||
    "";

  const loadedBackgroundCount = SIZE_OPTIONS.reduce(
    (count, option) => count + Number(Boolean(bgPreviews[option.key])),
    0
  );
  const totalZones = Object.values(allZones).reduce(
    (count, zones) => count + zones.length,
    0
  );
  const formatsStarted = SIZE_OPTIONS.reduce(
    (count, option) =>
      count + Number(Boolean(bgPreviews[option.key] || allZones[option.key].length)),
    0
  );

  return (
    <div className="page-container admin-cms-page-container space-y-4 pb-8 lg:space-y-5">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <button
              type="button"
              onClick={() => router.push(`/${locale}/admin/poster-templates`)}
              className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary transition hover:opacity-90"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Poster templates
            </button>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered creative studio
            </div>
            <h1 className="mt-3 text-[1.9rem] font-semibold tracking-tight text-foreground sm:text-[2rem]">
              New poster template
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Build reusable poster layouts with AI-generated zone positioning, smart color palettes, and multi-format support — or fine-tune everything manually.
            </p>
          </div>

            <div className="grid gap-2.5 sm:grid-cols-3 xl:min-w-[500px] xl:max-w-[580px]">
              <div className="workspace-glass-panel rounded-2xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Formats started
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {formatsStarted}/3
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Any format with a background or at least one text zone counts as in progress.
                </p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Backgrounds ready
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {loadedBackgroundCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload a separate image per aspect ratio when you need custom art direction.
                </p>
              </div>
              <div className="workspace-glass-panel rounded-2xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Total text zones
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {totalZones}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep hierarchy tight so each format stays readable after export.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/70 bg-white/70 p-2.5 backdrop-blur">
            <Button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="h-10 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Template
            </Button>
            <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Active format: {activeSizeConfig.label}
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/75 px-3 py-1.5 text-sm text-muted-foreground">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              Create one strong layout, then adapt spacing across formats.
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-1.5 text-sm text-violet-700">
              <Bot className="h-4 w-4" />
              Use AI panel on the right to auto-generate layouts
            </div>
          </div>
        </section>

        <section className="workspace-panel-surface rounded-[26px] p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Template settings
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Define the identity before arranging content
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a clear name, group the template into the right category, and choose the accent color that ties labels and calls to action together.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="poster-template-name" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Template name
                  </Label>
                  <Input
                    id="poster-template-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Corporate Blue"
                    className="h-11 rounded-2xl border-border bg-secondary/55 px-4 text-sm shadow-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Category
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-11 rounded-2xl border-border bg-secondary/55 px-4 text-sm shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option} className="capitalize">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="poster-template-accent" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Accent color
                  </Label>
                  <div className="flex h-11 items-center gap-3 rounded-2xl border border-border bg-secondary/55 px-3">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded-xl border border-border bg-transparent"
                      aria-label="Pick template accent color"
                    />
                    <Input
                      id="poster-template-accent"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 flex-1 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(239,246,255,0.92))] p-4 shadow-[0_20px_50px_-42px_rgba(2,132,199,0.5)]">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 shadow-inner"
                  style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
                >
                  <Palette className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Visual direction
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    {name.trim() || "Untitled template"}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-3.5 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Accent preview
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Use the accent for CTA blocks, highlight chips, or footer bands.
                    </p>
                  </div>
                  <div
                    className="h-12 w-12 rounded-2xl border border-slate-200 shadow-inner"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                  >
                    Primary highlight
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 capitalize">
                    {category}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    Ready for multi-size layouts
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-panel-surface rounded-[26px] p-4 sm:p-4.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Format builder
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                Tune each poster size without losing structure
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with the format you care about most, then reuse the same message architecture across the others.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/45 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Layers3 className="h-3.5 w-3.5" />
              {currentZones.length} zone{currentZones.length === 1 ? "" : "s"} on {activeSizeConfig.label}
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
            {SIZE_OPTIONS.map((option) => {
              const isActive = option.key === activeSize;
              const hasBackground = Boolean(bgPreviews[option.key]);
              const zoneCount = allZones[option.key].length;

              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    handleSwitchFormat(option.key);
                  }}
                  aria-pressed={isActive}
                  className={`rounded-[22px] border p-3.5 text-left transition ${
                    isActive
                      ? "border-sky-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(239,246,255,0.96))] shadow-[0_18px_40px_-32px_rgba(2,132,199,0.55)]"
                      : "border-border/70 bg-background/75 hover:border-sky-100 hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {option.ratio}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        hasBackground
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {hasBackground ? "Background ready" : "Awaiting image"}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm leading-5 text-muted-foreground">{option.description}</p>
                  <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/35 px-3 py-1.5 text-xs text-muted-foreground">
                    <span>{zoneCount} text zone{zoneCount === 1 ? "" : "s"}</span>
                    <span className="font-semibold text-foreground">
                      {isActive ? "Editing now" : "Switch format"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
          <section className="order-2 overflow-hidden rounded-[28px] workspace-panel-surface xl:order-1">
            <PosterZoneEditor
              zones={currentZones}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
              onSetZones={setCurrentZones}
            />
          </section>

          <section className="order-1 rounded-[28px] workspace-panel-surface p-4 sm:p-4.5 xl:order-2 xl:p-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Canvas workspace
                </p>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
                  {activeSizeConfig.label} poster canvas
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload the background first, then drag and resize text zones until the hierarchy feels balanced.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleBgUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 w-full gap-2 rounded-xl border-border bg-white/80 px-4 text-sm font-semibold text-foreground hover:bg-secondary sm:w-auto"
                >
                  <Upload className="h-4 w-4" />
                  Upload {activeSizeConfig.label} background
                </Button>
                <div className="inline-flex w-full items-center gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2 text-sm text-muted-foreground sm:w-auto">
                  <ImagePlus className="h-4 w-4 text-primary" />
                  {activeBgPreview
                    ? "Background loaded"
                    : "Add an image to preview real spacing"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-center rounded-[28px] border border-dashed border-border/70 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.08),_transparent_42%),linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.68))] p-3 sm:p-4">
              <PosterZoneCanvas
                bgUrl={activeBgPreview}
                size={activeSize}
                zones={currentZones}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                onUpdateZone={handleUpdateZone}
              />
            </div>
          </section>

          <section className="order-3 rounded-[28px] workspace-panel-surface overflow-hidden xl:order-3">
            <PosterAIAssistant
              activeSize={activeSize}
              category={category}
              accentColor={accentColor}
              currentZones={currentZones}
              hasBackground={Boolean(activeBgPreview)}
              onSetZones={setCurrentZones}
              onSetAccentColor={setAccentColor}
              onSelectZone={setSelectedZoneId}
            />
          </section>
        </div>
      </div>
    );
  }
