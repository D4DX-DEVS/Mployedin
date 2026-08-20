"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import type { PosterVariation, PosterType, PosterFormat, ShowFields, PosterLayout, PosterStyleOverrides, PosterElementId, ElementOverride } from "@/lib/composer/types";
import { FORMAT_DIMENSIONS, POSTER_FONTS, TEMPLATES, POSTER_ELEMENTS, POSTER_SWATCHES } from "@/lib/composer/types";
import { PosterOverlay } from "./PosterOverlay";
import { buildPosterShareUrl, buildQrTrackingUrl } from "@/lib/composer/branding";
import { exportPosterPng } from "./exportPoster";
import { Download, Copy, Share2, Save, Undo2, Redo2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

interface PosterPreviewPanelProps {
  variation: PosterVariation | null;
  job: { title?: string; companyName?: string; logo?: string; location?: { city?: string; country?: string }; salary?: { min?: number; max?: number; currency?: string }; experienceMin?: number; experienceMax?: number; skills?: string[] } | null;
  posterType: PosterType;
  showFields: ShowFields;
  formats: PosterFormat[];
  shareSlug: string | null;
  generationId: string | null;
}

export function PosterPreviewPanel({
  variation,
  job,
  posterType,
  showFields,
  formats,
  shareSlug,
  generationId,
}: PosterPreviewPanelProps) {
  const t = useTranslations("posterPreviewPanel");

  // QR data URL (base64) generated once from the share slug → tracking redirect → apply page.
  // Passed to both preview and export so it embeds without a runtime CORS fetch.
  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!shareSlug) { setQrDataUrl(""); return; }
    QRCode.toDataURL(buildQrTrackingUrl(shareSlug), { margin: 1, width: 240 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [shareSlug]);

  const [exportingFormat, setExportingFormat] = useState<PosterFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Post-generation editor state. Position/composition is changed by switching
  // template (layout); appearance by font/theme/weight/overlay overrides.
  const { state, set, checkpoint, undo, redo, canUndo, canRedo } = useHistory({ look: {}, layout: null });
  const look = state.look;
  const setLook = useCallback(
    (u: PosterStyleOverrides | ((s: PosterStyleOverrides) => PosterStyleOverrides)) =>
      set((s) => ({ ...s, look: typeof u === "function" ? u(s.look) : u })),
    [set],
  );
  const setLayoutOverride = useCallback((layout: PosterLayout | null) => set((s) => ({ ...s, layout })), [set]);
  const [selectedId, setSelectedId] = useState<PosterElementId | null>(null);
  const activeLayout = state.layout ?? variation?.layout ?? "layout-a";

  // Restore edits from localStorage (survives reload), then autosave on every change.
  const storageKey = generationId ? `poster-edit:${generationId}` : null;
  const restored = useRef(false);
  useEffect(() => {
    if (!storageKey || restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const v = JSON.parse(raw); if (v && typeof v === "object") set({ look: v.look ?? {}, layout: v.layout ?? null }, false); }
    } catch { /* ignore corrupt cache */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ look: state.look, layout: state.layout })); } catch { /* quota/private mode */ }
  }, [storageKey, state]);

  const [recentColors, setRecentColors] = useState<string[]>([]);
  const el = selectedId ? look.elements?.[selectedId] : undefined;
  const selMeta = selectedId ? POSTER_ELEMENTS.find((e) => e.id === selectedId) : undefined;
  const patchEl = useCallback((id: PosterElementId, patch: Partial<ElementOverride>) => {
    setLook((s) => ({ ...s, elements: { ...s.elements, [id]: { ...s.elements?.[id], ...patch } } }));
  }, [setLook]);
  const applyColor = useCallback((id: PosterElementId, color: string) => {
    patchEl(id, { color });
    setRecentColors((r) => [color, ...r.filter((c) => c !== color)].slice(0, 6));
  }, [patchEl]);
  const resetEl = useCallback((id: PosterElementId) => {
    setLook((s) => {
      const next = { ...s.elements };
      delete next[id];
      return { ...s, elements: next };
    });
  }, [setLook]);

  // Keyboard: Esc deselects; Ctrl/Cmd+Z undo; +Shift or Ctrl+Y redo (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const downloadPng = useCallback(async (format: PosterFormat) => {
    if (!variation || exportingFormat) return;
    setExportError(null);
    setExportingFormat(format);
    try {
      const dataUrl = await exportPosterPng({
        format,
        backgroundUrl: variation.backgroundUrl,
        job,
        posterType,
        showFields,
        layout: activeLayout,
        qrDataUrl,
        style: look,
      });
      const link = document.createElement("a");
      link.download = `poster-${posterType}-${format}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: unknown) {
      setExportError("We couldn't export the poster. No file was downloaded. Try again.");
    } finally {
      setExportingFormat(null);
    }
  }, [variation, job, posterType, showFields, qrDataUrl, exportingFormat, activeLayout, look]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generationId) throw new Error("No generation to save");
      const res = await fetch(`/api/employers/posters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          styleOverrides: Object.keys(look).length ? look : undefined,
          layoutOverride: state.layout ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save poster");
      return res.json();
    },
  });

  const copyShareLink = useCallback(() => {
    if (!shareSlug) return;
    const url = buildPosterShareUrl(shareSlug);
    navigator.clipboard.writeText(url);
  }, [shareSlug]);

  if (!variation) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-xs text-muted-foreground">
          {t("noPreview")}
        </p>
      </div>
    );
  }

  const shareUrl = shareSlug ? buildPosterShareUrl(shareSlug) : "";

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Large preview */}
      <div
        className="relative aspect-square rounded-lg overflow-hidden border"
        style={{ containerType: "size" }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${variation.backgroundUrl})` }}
        />
        <PosterOverlay
          job={job}
          posterType={posterType}
          showFields={showFields}
          layout={activeLayout}
          format="instagram-post"
          qrDataUrl={qrDataUrl}
          style={look}
          editable
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onMove={(id, x, y) => set((s) => ({ ...s, look: { ...s.look, elements: { ...s.look.elements, [id]: { ...s.look.elements?.[id], x, y } } } }), false)}
          onResize={(id, scale) => set((s) => ({ ...s, look: { ...s.look, elements: { ...s.look.elements, [id]: { ...s.look.elements?.[id], fontScale: scale } } } }), false)}
          onPatch={patchEl}
          onInteractStart={checkpoint}
        />
      </div>

      {/* Undo / redo (Ctrl+Z / Ctrl+Shift+Z). */}
      {(canUndo || canRedo) && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!canUndo} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] disabled:opacity-40 hover:bg-muted/50">
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] disabled:opacity-40 hover:bg-muted/50">
            <Redo2 className="h-3 w-3" /> Redo
          </button>
        </div>
      )}

      {/* Poster editor. No selection → poster-level look. Element selected → inspector. */}
      {selectedId ? (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              {POSTER_ELEMENTS.find((e) => e.id === selectedId)?.label}
            </p>
            <button type="button" onClick={() => setSelectedId(null)} className="text-[10px] text-muted-foreground underline">
              ← Poster settings
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground -mt-1">Drag it on the poster to reposition.</p>

          {selMeta?.editableText && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Text</p>
              <input
                type="text"
                value={el?.text ?? ""}
                placeholder="(default)"
                onChange={(e) => patchEl(selectedId, { text: e.target.value || undefined })}
                className="w-full rounded-md border px-2 py-1.5 text-[11px] bg-background"
              />
            </div>
          )}

          <EditorRow label={selMeta?.kind === "image" ? "Size" : "Font size"}>
            <Chip active={false} onClick={() => patchEl(selectedId, { fontScale: clamp((el?.fontScale ?? 1) - 0.1, 0.5, 2.5) })}>−</Chip>
            <input
              type="number"
              min={50}
              max={250}
              step={5}
              value={Math.round((el?.fontScale ?? 1) * 100)}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) patchEl(selectedId, { fontScale: clamp(v / 100, 0.5, 2.5) }); }}
              className="w-14 rounded-md border px-1.5 py-0.5 text-[11px] bg-background text-center"
            />
            <span className="text-[10px] text-muted-foreground self-center">%</span>
            <Chip active={false} onClick={() => patchEl(selectedId, { fontScale: clamp((el?.fontScale ?? 1) + 0.1, 0.5, 2.5) })}>+</Chip>
          </EditorRow>

          {selMeta?.kind === "text" && (
            <>
              <EditorRow label="Weight">
                {([400, 500, 600, 700, 800] as const).map((w) => (
                  <Chip key={w} active={el?.fontWeight === w} onClick={() => patchEl(selectedId, { fontWeight: w })}>
                    {w}
                  </Chip>
                ))}
              </EditorRow>

              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Color</p>
                <div className="flex items-center gap-2 mb-1.5">
                  <input
                    type="color"
                    value={el?.color ?? "#ffffff"}
                    onChange={(e) => applyColor(selectedId, e.target.value)}
                    className="h-7 w-9 rounded border bg-background p-0.5"
                  />
                  <input
                    type="text"
                    value={el?.color ?? ""}
                    placeholder="#ffffff"
                    onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{3,8}$/.test(v)) applyColor(selectedId, v); }}
                    className="w-24 rounded-md border px-2 py-1 text-[11px] bg-background"
                  />
                </div>
                {recentColors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    <span className="text-[9px] text-muted-foreground self-center mr-0.5">Recent</span>
                    {recentColors.map((c) => (
                      <button key={`r-${c}`} type="button" onClick={() => applyColor(selectedId, c)} className="h-5 w-5 rounded-full border" style={{ backgroundColor: c }} aria-label={c} />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {POSTER_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => applyColor(selectedId, c)}
                      className={`h-5 w-5 rounded-full border ${el?.color === c ? "ring-2 ring-primary" : ""}`}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            {selectedId !== "platformLogo" && (
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={el?.hidden ?? false} onChange={(e) => patchEl(selectedId, { hidden: e.target.checked || undefined })} />
                Hide element
              </label>
            )}
            {(el?.x != null || el?.y != null) && (
              <button type="button" onClick={() => patchEl(selectedId, { x: undefined, y: undefined })} className="text-[10px] text-muted-foreground underline">
                Reset position
              </button>
            )}
            {el && Object.keys(el).length > 0 && (
              <button type="button" onClick={() => resetEl(selectedId)} className="text-[10px] text-muted-foreground underline">
                Reset element
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-xs font-semibold text-foreground">Customize look</p>
          <p className="text-[10px] text-muted-foreground -mt-1">Tip: click any text on the poster to edit it (size, weight, color, text).</p>

          <EditorRow label="Template">
            {TEMPLATES.map((tpl) => (
              <Chip key={tpl.id} active={activeLayout === tpl.layout} onClick={() => setLayoutOverride(tpl.layout)}>
                {tpl.label}
              </Chip>
            ))}
          </EditorRow>

          <EditorRow label="Font">
            {POSTER_FONTS.map((f) => (
              <Chip key={f.id} active={(look.fontFamily ?? POSTER_FONTS[0].stack) === f.stack} onClick={() => setLook((s) => ({ ...s, fontFamily: f.stack }))}>
                <span style={{ fontFamily: f.stack }}>{f.label}</span>
              </Chip>
            ))}
          </EditorRow>

          <EditorRow label="Text theme">
            {([
              ["white", "White"], ["warm", "Warm"], ["sky", "Sky"], ["mono-dark", "Dark"],
            ] as const).map(([id, label]) => (
              <Chip key={id} active={(look.textTheme ?? "white") === id} onClick={() => setLook((s) => ({ ...s, textTheme: id }))}>
                {label}
              </Chip>
            ))}
          </EditorRow>

          <EditorRow label="All text size">
            <Chip active={false} onClick={() => setLook((s) => ({ ...s, textScale: clamp((s.textScale ?? 1) - 0.1, 0.5, 2) }))}>−</Chip>
            <input
              type="number"
              min={50}
              max={200}
              step={5}
              value={Math.round((look.textScale ?? 1) * 100)}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setLook((s) => ({ ...s, textScale: clamp(v / 100, 0.5, 2) })); }}
              className="w-14 rounded-md border px-1.5 py-0.5 text-[11px] bg-background text-center"
            />
            <span className="text-[10px] text-muted-foreground self-center">%</span>
            <Chip active={false} onClick={() => setLook((s) => ({ ...s, textScale: clamp((s.textScale ?? 1) + 0.1, 0.5, 2) }))}>+</Chip>
          </EditorRow>

          <EditorRow label="Body weight">
            {([[400, "Plain"], [500, "Medium"], [700, "Bold"]] as const).map(([w, label]) => (
              <Chip key={w} active={(look.bodyWeight ?? 400) === w} onClick={() => setLook((s) => ({ ...s, bodyWeight: w }))}>
                {label}
              </Chip>
            ))}
          </EditorRow>

          <EditorRow label="Overlay">
            {([["none", "None"], ["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"]] as const).map(([id, label]) => (
              <Chip key={id} active={(look.overlay ?? "medium") === id} onClick={() => setLook((s) => ({ ...s, overlay: id }))}>
                {label}
              </Chip>
            ))}
          </EditorRow>

          {(state.layout || Object.keys(look).length > 0) && (
            <button
              type="button"
              onClick={() => set({ look: {}, layout: null })}
              className="text-[10px] text-muted-foreground underline"
            >
              Reset all
            </button>
          )}
        </div>
      )}

      {/* Download per format */}
      <div>
        <p className="text-xs font-medium text-foreground mb-2">{t("downloadShareTitle")}</p>
        <p className="text-[10px] text-muted-foreground mb-2">{t("downloadShareDesc")}</p>
        <div className="space-y-1.5">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => downloadPng(f)}
              disabled={exportingFormat !== null}
              className="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-[11px] hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {FORMAT_DIMENSIONS[f].label} ({FORMAT_DIMENSIONS[f].width}×{FORMAT_DIMENSIONS[f].height})
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                {exportingFormat === f ? "Exporting…" : "PNG"} <Download className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
        {exportError && <p className="text-[10px] text-destructive mt-2">{exportError}</p>}
      </div>

      {/* Share Link */}
      {shareSlug && (
        <div>
          <p className="text-xs font-medium text-foreground mb-1">Share Poster</p>
          <p className="text-[10px] text-muted-foreground mb-2">Anyone with this link can view this poster</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 rounded-md border px-2 py-1.5 text-[10px] bg-muted"
            />
            <button
              type="button"
              onClick={copyShareLink}
              className="px-2 py-1.5 rounded-md border hover:bg-muted text-xs"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={copyShareLink}
              className="px-2 py-1.5 rounded-md border hover:bg-muted text-xs"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || saveMutation.isSuccess}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary/5 text-primary py-2.5 text-sm font-medium hover:bg-primary/10 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {saveMutation.isSuccess ? t("savedState") : saveMutation.isPending ? t("savingState") : t("saveButton")}
      </button>
    </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n * 100) / 100));

interface EditState { look: PosterStyleOverrides; layout: PosterLayout | null; }

// Minimal undo/redo over the combined editor state. Drag/resize call checkpoint()
// once at gesture start then set(record:false) per move, so a whole drag is one step.
function useHistory(initial: EditState) {
  const [state, setState] = useState<EditState>(initial);
  const past = useRef<EditState[]>([]);
  const future = useRef<EditState[]>([]);
  const set = useCallback((updater: EditState | ((p: EditState) => EditState), record = true) => {
    setState((prev) => {
      const value = typeof updater === "function" ? updater(prev) : updater;
      if (value === prev) return prev;
      if (record) { past.current.push(prev); if (past.current.length > 50) past.current.shift(); future.current = []; }
      return value;
    });
  }, []);
  const checkpoint = useCallback(() => {
    setState((prev) => {
      if (past.current[past.current.length - 1] === prev) return prev;
      past.current.push(prev); if (past.current.length > 50) past.current.shift(); future.current = [];
      return prev;
    });
  }, []);
  const undo = useCallback(() => setState((prev) => { const p = past.current.pop(); if (p === undefined) return prev; future.current.push(prev); return p; }), []);
  const redo = useCallback(() => setState((prev) => { const f = future.current.pop(); if (f === undefined) return prev; past.current.push(prev); return f; }), []);
  return { state, set, checkpoint, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

function EditorRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[10px] border transition-all ${
        active ? "bg-primary/10 border-primary text-foreground" : "border-border hover:border-primary/40 text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
