"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  usePosterTemplate,
  useUpdatePosterTemplate,
} from "@/hooks/usePosterTemplates";
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
import { ArrowLeft, Save, Upload, Loader2 } from "lucide-react";
import type { TextZone } from "@/hooks/usePosterTemplates";

type SizeKey = "landscape" | "square" | "story";

export default function EditPosterTemplatePage() {
  const router = useRouter();
  const { locale, id } = useParams();
  const templateId = String(id);

  const { data: template, isLoading } = usePosterTemplate(templateId);
  const updateMutation = useUpdatePosterTemplate(templateId);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("corporate");
  const [accentColor, setAccentColor] = useState("#6366F1");
  const [activeSize, setActiveSize] = useState<SizeKey>("landscape");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

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

  // Populate state from loaded template
  useEffect(() => {
    if (template && !initialized) {
      setName(template.name);
      setCategory(template.category);
      setAccentColor(template.defaultAccentColor);
      setBgPreviews({
        landscape: template.backgroundImages.landscape ?? "",
        square: template.backgroundImages.square ?? "",
        story: template.backgroundImages.story ?? "",
      });
      setAllZones({
        landscape: template.textZones.landscape ?? [],
        square: template.textZones.square ?? [],
        story: template.textZones.story ?? [],
      });
      setInitialized(true);
    }
  }, [template, initialized]);

  const handleBgUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBgFiles((prev) => ({ ...prev, [activeSize]: file }));
      const url = URL.createObjectURL(file);
      setBgPreviews((prev) => ({ ...prev, [activeSize]: url }));
    },
    [activeSize]
  );

  const currentZones = allZones[activeSize];
  const setCurrentZones = useCallback(
    (zones: TextZone[]) => {
      setAllZones((prev) => ({ ...prev, [activeSize]: zones }));
    },
    [activeSize]
  );

  const handleUpdateZone = useCallback(
    (id: string, update: Partial<TextZone>) => {
      setCurrentZones(
        currentZones.map((z) => (z.id === id ? { ...z, ...update } : z))
      );
    },
    [currentZones, setCurrentZones]
  );

  // When switching formats, copy + adapt zones if the target format is empty
  const handleSwitchFormat = useCallback(
    (targetSize: SizeKey) => {
      if (targetSize === activeSize) return;

      setAllZones((prev) => {
        if (prev[targetSize].length > 0) return prev;

        const sourceKey =
          prev[activeSize].length > 0
            ? activeSize
            : (["landscape", "square", "story"] as const).find((k) => prev[k].length > 0);

        if (!sourceKey) return prev;

        const adapted = prev[sourceKey].map((zone) => {
          const z = { ...zone, id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
          const isToTall = targetSize === "story";
          const isToWide = targetSize === "landscape";
          const isFromTall = sourceKey === "story";
          const isFromWide = sourceKey === "landscape";

          if ((isFromWide && isToTall) || (isFromTall && isToWide)) {
            if (isToTall) {
              z.x = Math.min(z.x, 6);
              z.w = Math.min(Math.max(z.w, 70), 88);
              z.align = "center";
            } else {
              z.w = Math.min(z.w, 50);
            }
          } else if (targetSize === "square") {
            z.w = Math.min(Math.max(z.w, 40), 80);
            z.x = Math.max(z.x, 10);
            z.align = "center";
          }

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
    if (!name.trim()) return alert("Template name is required.");

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("category", category);
    fd.append("defaultAccentColor", accentColor);
    fd.append("textZones", JSON.stringify(allZones));

    for (const sk of ["landscape", "square", "story"] as const) {
      const file = bgFiles[sk];
      if (file) fd.append(`bg_${sk}`, file);
    }

    try {
      await updateMutation.mutateAsync(fd);
      router.push(`/${locale}/admin/poster-templates`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // Fallback: show any uploaded bg when current format has none
  const activeBgPreview =
    bgPreviews[activeSize] ||
    bgPreviews.landscape ||
    bgPreviews.square ||
    bgPreviews.story ||
    "";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-container admin-cms-page-container space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/${locale}/admin/poster-templates`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Edit Template</h1>
          <p className="text-sm text-muted-foreground">{name || "Untitled"}</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Template meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border bg-card">
        <div>
          <Label className="text-xs">Template Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Corporate Blue"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="corporate">Corporate</SelectItem>
              <SelectItem value="creative">Creative</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="tech">Tech</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Accent Color</Label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-9 rounded border cursor-pointer"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Size tabs */}
      <div className="flex gap-2">
        {(["landscape", "square", "story"] as const).map((sk) => (
          <Button
            key={sk}
            variant={activeSize === sk ? "default" : "outline"}
            size="sm"
            onClick={() => {
              handleSwitchFormat(sk);
            }}
          >
            {sk.charAt(0).toUpperCase() + sk.slice(1)}
            {bgPreviews[sk] && " ✓"}
          </Button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex gap-4 min-h-[500px]">
        <div className="w-64 shrink-0 rounded-lg border bg-card overflow-hidden">
          <PosterZoneEditor
            zones={currentZones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onSetZones={setCurrentZones}
          />
        </div>

        <div className="flex-1 flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleBgUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-3 w-3" />
              {activeBgPreview ? "Replace" : "Upload"} {activeSize} background
            </Button>
            {activeBgPreview && (
              <span className="text-xs text-green-600">✓ Image loaded</span>
            )}
          </div>

          <PosterZoneCanvas
            bgUrl={activeBgPreview}
            size={activeSize}
            zones={currentZones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            onUpdateZone={handleUpdateZone}
          />
        </div>

        <div className="w-80 shrink-0 rounded-lg border bg-card overflow-hidden">
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
        </div>
      </div>
    </div>
  );
}
