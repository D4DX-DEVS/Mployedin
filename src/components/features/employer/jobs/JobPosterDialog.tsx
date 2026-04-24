"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  RefreshCw,
  Sparkles,
  Linkedin,
  Save,
  Loader2,
  Image as ImageIcon,
  Square,
  Smartphone,
  Upload,
} from "lucide-react";
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import { JobPoster, type PosterData, type PosterTemplate, type PosterSize } from "./JobPoster";
import { usePosterAI } from "@/hooks/usePosterAI";
import { useActivePosterTemplates, type PosterTemplateItem } from "@/hooks/usePosterTemplates";

interface JobForPoster {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  location?: { country?: string; city?: string; isRemote?: boolean } | string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
    isNegotiable?: boolean;
  };
  requirements?: {
    skills?: string[];
    experienceMin?: number;
    experienceMax?: number;
  };
  workMode?: string;
  employmentType?: string;
  vacancies?: number;
  tags?: string[];
  employerId?: {
    companyName?: string;
    logo?: string;
    industry?: string;
  };
}

interface JobPosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobForPoster;
  locale: string;
  /** Optional extra benefits from job description */
  benefits?: string[];
}

const SIZE_OPTIONS: { value: PosterSize; label: string; icon: React.ReactNode }[] = [
  { value: "landscape", label: "LinkedIn", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { value: "square", label: "Square", icon: <Square className="w-3.5 h-3.5" /> },
  { value: "story", label: "Story", icon: <Smartphone className="w-3.5 h-3.5" /> },
];

const SIZE_PIXELS = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export function JobPosterDialog({
  open,
  onOpenChange,
  job,
  locale,
  benefits = [],
}: JobPosterDialogProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState<PosterTemplate>("professional");
  const [size, setSize] = useState<PosterSize>("landscape");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null);
  const [selectedBgTemplate, setSelectedBgTemplate] = useState<PosterTemplateItem | null>(null);
  const [bgAccentColor, setBgAccentColor] = useState<string>("");
  const [bgTextTheme, setBgTextTheme] = useState<"light" | "dark" | "auto">("auto");
  const [bgFontFamily, setBgFontFamily] = useState<string>("");
  const [bgFontScale, setBgFontScale] = useState<number>(1);

  // Fetch admin-created background templates
  const { data: bgTemplates } = useActivePosterTemplates();

  // Editable overrides
  const [editTagline, setEditTagline] = useState<string | null>(null);
  const [editCta, setEditCta] = useState<string | null>(null);

  const companyName =
    typeof job.employerId === "object" ? job.employerId?.companyName : undefined;
  const logoUrl =
    typeof job.employerId === "object" ? job.employerId?.logo : undefined;
  const industry =
    typeof job.employerId === "object" ? job.employerId?.industry : undefined;

  // Build AI input
  const aiInput = {
    title: job.title,
    description: job.description,
    companyName: companyName ?? "Company",
    industry,
    category: job.category,
    location:
      typeof job.location === "object" ? job.location : undefined,
    salary: job.salary,
    skills: job.requirements?.skills,
    benefits,
    experienceMin: job.requirements?.experienceMin,
    experienceMax: job.requirements?.experienceMax,
    workMode: job.workMode,
    employmentType: job.employmentType,
    vacancies: job.vacancies,
  };

  const { design, isLoading, regenerate, isReady } = usePosterAI(job._id, aiInput);

  // Generate QR code
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const jobUrl = `${baseUrl}/${locale}/job-seeker/jobs/${job._id}`;

  useEffect(() => {
    QRCode.toString(jobUrl, {
      type: "svg",
      margin: 0,
      width: 200,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrSvg)
      .catch(() => setQrSvg(""));

    // Also generate data URL for PNG export
    QRCode.toDataURL(jobUrl, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [jobUrl]);

  // Convert external logo URL to data URL to avoid CORS in toPng()
  useEffect(() => {
    if (uploadedLogoUrl) return; // User uploaded a logo — skip fetching
    if (!logoUrl) return;
    let cancelled = false;

    // Use our API proxy to avoid CORS issues with external CDN URLs
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(logoUrl)}`;

    fetch(proxyUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Proxy failed");
        return r.blob();
      })
      .then(
        (blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          })
      )
      .then((dataUrl) => {
        if (!cancelled) setLogoDataUrl(dataUrl);
      })
      .catch(() => {
        // Direct fetch as fallback (works for same-origin or CORS-enabled URLs)
        if (cancelled) return;
        fetch(logoUrl)
          .then((r) => r.blob())
          .then(
            (blob) =>
              new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              })
          )
          .then((dataUrl) => {
            if (!cancelled) setLogoDataUrl(dataUrl);
          })
          .catch(() => {
            // Last resort: use Next.js image proxy (won't work in toPng but shows in preview)
            if (!cancelled) setLogoDataUrl(`/_next/image?url=${encodeURIComponent(logoUrl)}&w=256&q=90`);
          });
      });
    return () => {
      cancelled = true;
    };
  }, [logoUrl, uploadedLogoUrl]);

  // Handle logo file upload
  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate: only images, max 2MB
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setUploadedLogoUrl(dataUrl);
      setLogoDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }, []);

  // When AI loads, auto-pick template
  useEffect(() => {
    if (isReady && design.template) {
      setTemplate(design.template);
    }
  }, [isReady, design.template]);

  // Build location string
  const locationStr =
    typeof job.location === "string"
      ? job.location
      : job.location
        ? `${job.location.city ?? ""}${job.location.city && job.location.country ? ", " : ""}${job.location.country ?? ""}${job.location.isRemote ? " (Remote)" : ""}`
        : undefined;

  // Build salary string
  const salaryStr =
    job.salary?.min || job.salary?.max
      ? `${job.salary.currency ?? "USD"} ${job.salary.min?.toLocaleString() ?? "0"}–${job.salary.max?.toLocaleString() ?? "0"}/${job.salary.period ?? "mo"}`
      : undefined;

  // Build experience string
  const expStr =
    job.requirements?.experienceMin !== undefined || job.requirements?.experienceMax !== undefined
      ? `${job.requirements.experienceMin ?? 0}–${job.requirements.experienceMax ?? 10} yrs`
      : undefined;

  const posterData: PosterData = {
    title: job.title,
    companyName: companyName ?? "Company",
    logoUrl: logoDataUrl ?? logoUrl,
    tagline: editTagline ?? (design.tagline || undefined),
    location: locationStr,
    salary: salaryStr,
    workMode: job.workMode,
    experience: expStr,
    skills: job.requirements?.skills ?? [],
    benefits: benefits.length > 0 ? benefits : design.highlights ?? [],
    cta: editCta ?? (design.cta || "Apply Now!"),
    accentColor: design.accentColor ?? "#6366F1",
    qrCodeSvg: qrSvg,
    qrDataUrl,
    highlights: design.highlights,
  };

  // Download as PNG
  const handleDownload = useCallback(async () => {
    if (!posterRef.current) return;
    setIsDownloading(true);

    try {
      const { width, height } = SIZE_PIXELS[size];
      const node = posterRef.current;
      const dataUrl = await toPng(node, {
        width,
        height,
        pixelRatio: 2,
        style: {
          transform: `scale(${width / node.offsetWidth})`,
          transformOrigin: "top left",
          width: `${node.offsetWidth}px`,
          height: `${node.offsetHeight}px`,
        },
      });

      const link = document.createElement("a");
      const safeName = (companyName ?? "company")
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase();
      const safeTitle = job.title
        .replace(/[^a-zA-Z0-9]/g, "-")
        .toLowerCase()
        .slice(0, 30);
      link.download = `${safeName}-${safeTitle}-poster.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsDownloading(false);
    }
  }, [size, companyName, job.title]);

  // Save to gallery (S3)
  const handleSave = useCallback(async () => {
    if (!posterRef.current) return;
    setIsSaving(true);

    try {
      const { width, height } = SIZE_PIXELS[size];
      const node = posterRef.current;
      const dataUrl = await toPng(node, {
        width,
        height,
        pixelRatio: 2,
        style: {
          transform: `scale(${width / node.offsetWidth})`,
          transformOrigin: "top left",
          width: `${node.offsetWidth}px`,
          height: `${node.offsetHeight}px`,
        },
      });

      // Convert data URL to blob
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();

      const formData = new FormData();
      formData.append("file", blob, `poster-${job._id}.png`);
      formData.append("jobId", job._id);

      const saveResp = await fetch("/api/employers/posters", {
        method: "POST",
        body: formData,
      });

      if (!saveResp.ok) throw new Error("Save failed");
    } finally {
      setIsSaving(false);
    }
  }, [size, job._id]);

  // Share to LinkedIn (open share dialog with job URL)
  const handleLinkedInShare = useCallback(() => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500",
    );
  }, [jobUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Create Job Poster
          </DialogTitle>
          <DialogDescription className="sr-only">Design and download a shareable poster for this job listing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Template selector */}
            <Tabs
              value={template}
              onValueChange={(v) => {
                setTemplate(v as PosterTemplate);
                if (v !== "background") {
                  setSelectedBgTemplate(null);
                  setBgAccentColor("");
                  setBgTextTheme("auto");
                  setBgFontFamily("");
                  setBgFontScale(1);
                }
              }}
            >
              <TabsList className="h-9">
                <TabsTrigger value="professional" className="text-xs">
                  Professional
                </TabsTrigger>
                <TabsTrigger value="clean" className="text-xs">
                  Clean
                </TabsTrigger>
                <TabsTrigger value="social" className="text-xs">
                  Social
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Size selector */}
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSize(opt.value)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    size === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            {/* AI Regenerate */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9"
              onClick={regenerate}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {isLoading ? "Generating…" : "✨ Regenerate"}
            </Button>
          </div>

          {/* Editable tagline + CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tagline
              </label>
              <input
                type="text"
                maxLength={60}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder={isLoading ? "AI generating…" : "Enter a catchy tagline"}
                value={editTagline ?? design.tagline ?? ""}
                onChange={(e) => setEditTagline(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Call to Action
              </label>
              <input
                type="text"
                maxLength={40}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Apply Now!"
                value={editCta ?? design.cta ?? "Apply Now!"}
                onChange={(e) => setEditCta(e.target.value)}
              />
            </div>
          </div>

          {/* Company Logo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Company Logo
            </label>
            <div className="flex items-center gap-3">
              {/* Logo preview */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
                {(uploadedLogoUrl || logoDataUrl || logoUrl) ? (
                  <img
                    src={uploadedLogoUrl || logoDataUrl || logoUrl}
                    alt={companyName ?? "Logo"}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">
                    {companyName?.charAt(0) ?? "C"}
                  </span>
                )}
              </div>
              {/* Upload button */}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadedLogoUrl ? "Change Logo" : logoUrl ? "Replace Logo" : "Upload Logo"}
              </button>
              {uploadedLogoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadedLogoUrl(null);
                    setLogoDataUrl(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive transition"
                >
                  Remove
                </button>
              )}
              {!uploadedLogoUrl && !logoUrl && (
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, SVG or WebP — max 2 MB
                </span>
              )}
            </div>
          </div>

          {/* Background template gallery */}
          {bgTemplates && bgTemplates.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Background Templates
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {bgTemplates.map((bt) => {
                  const thumb =
                    bt.backgroundImages[size] ??
                    bt.backgroundImages.landscape ??
                    bt.backgroundImages.square;
                  const isSelected =
                    template === "background" && selectedBgTemplate?._id === bt._id;
                  return (
                    <button
                      key={bt._id}
                      onClick={() => {
                        setTemplate("background");
                        setSelectedBgTemplate(bt);
                      }}
                      className={`shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={bt.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full"
                          style={{ backgroundColor: bt.defaultAccentColor }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color & Style customization — only for background templates */}
          {template === "background" && selectedBgTemplate && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customize Template
              </p>

              {/* Row 1: Accent Color + Text Theme */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Accent color */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="color"
                      value={bgAccentColor || selectedBgTemplate.defaultAccentColor}
                      onChange={(e) => setBgAccentColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
                    />
                    {["#6366F1", "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0D9488", "#EC4899"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setBgAccentColor(c)}
                        className={`h-6 w-6 rounded-full border-2 transition-all ${
                          (bgAccentColor || selectedBgTemplate.defaultAccentColor) === c
                            ? "border-foreground scale-110"
                            : "border-transparent hover:border-muted-foreground/40"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    {bgAccentColor && (
                      <button
                        type="button"
                        onClick={() => setBgAccentColor("")}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Text theme */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Text Theme
                  </label>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
                    {([
                      { value: "auto" as const, label: "Auto" },
                      { value: "light" as const, label: "Light" },
                      { value: "dark" as const, label: "Dark" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBgTextTheme(opt.value)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          bgTextTheme === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: Font Family + Font Scale */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Font family */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Font
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { value: "", label: "Inter", family: "'Inter', sans-serif" },
                      { value: "'Georgia', serif", label: "Georgia", family: "'Georgia', serif" },
                      { value: "'Playfair Display', serif", label: "Playfair", family: "'Playfair Display', serif" },
                      { value: "'Space Grotesk', sans-serif", label: "Grotesk", family: "'Space Grotesk', sans-serif" },
                      { value: "'Roboto Mono', monospace", label: "Mono", family: "'Roboto Mono', monospace" },
                    ].map((f) => (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() => setBgFontFamily(f.value)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                          bgFontFamily === f.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                        style={{ fontFamily: f.family }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font scale */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Text Size
                    <span className="ml-2 text-[10px] text-muted-foreground/70">
                      {Math.round(bgFontScale * 100)}%
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">A</span>
                    <input
                      type="range"
                      min={0.7}
                      max={1.5}
                      step={0.05}
                      value={bgFontScale}
                      onChange={(e) => setBgFontScale(Number(e.target.value))}
                      className="h-2 flex-1 cursor-pointer accent-primary"
                    />
                    <span className="text-sm font-bold text-muted-foreground">A</span>
                    {bgFontScale !== 1 && (
                      <button
                        type="button"
                        onClick={() => setBgFontScale(1)}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Poster Preview */}
          <div className="flex justify-center rounded-xl bg-muted/40 p-6 overflow-auto">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  AI is designing your poster…
                </p>
              </div>
            ) : (
              <JobPoster
                ref={posterRef}
                data={posterData}
                template={template}
                size={size}
                backgroundTemplate={selectedBgTemplate ?? undefined}
                bgAccentColor={bgAccentColor || undefined}
                bgTextTheme={bgTextTheme}
                bgFontFamily={bgFontFamily || undefined}
                bgFontScale={bgFontScale}
              />
            )}
          </div>

          {/* Social Caption */}
          {design.socialCaption && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                LinkedIn Caption (copy & paste)
              </label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                readOnly
                value={design.socialCaption}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              className="gap-1.5"
              onClick={handleDownload}
              disabled={isDownloading || isLoading}
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isDownloading ? "Generating…" : "Download PNG"}
            </Button>

            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? "Saving…" : "Save to Gallery"}
            </Button>

            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleLinkedInShare}
              disabled={isLoading}
            >
              <Linkedin className="w-4 h-4" />
              Share on LinkedIn
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 ms-auto"
              onClick={regenerate}
              disabled={isLoading}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Variation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
