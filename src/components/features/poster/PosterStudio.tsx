"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Check, Copy, Download, ExternalLink, ImageIcon, Images, Loader2, Palette, Save, Sparkles, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MPLOYEDIN_LOGO_URL, type BrandKit, type PosterContact } from "@/lib/brand/brandKit";
import { POSTER_FONT_VARIABLES } from "@/lib/brand/posterFontFaces";
import { buildJobApplyUrl, buildPosterShareUrl } from "@/lib/composer/branding";
import { buildBrandPosterData, defaultHeadline, type PosterJobInput } from "@/lib/poster/brandPosterContent";
import { BRAND_LAYOUTS, POSTER_SIZES, type BrandLayout, type PosterLook, type PosterSize } from "./BrandPoster";
import { ScaledPoster } from "./ScaledPoster";

type Source = "company" | "mployedin";
interface KitView { kit: BrandKit; platform: BrandKit; isCustom: boolean; companyLogo: string | null; companyName: string; contact?: PosterContact }
interface Saved { id: string; shareSlug: string }

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "request failed");
  return body as T;
}

const LOOK_ICON: Record<PosterLook, typeof Zap> = { bold: Sparkles, clean: Palette, urgent: Zap };
const SIZES: PosterSize[] = ["square", "story", "landscape", "a4"];

/**
 * The three-step poster maker: Job → Look → Share. Six code-drawn layouts in
 * the chosen brand appear at once (free, instant); saving one gives a share
 * link, a tracked QR code and PNG downloads in every size.
 */
export function PosterStudio({ jobId }: { jobId: string }) {
  const t = useTranslations("posterStudio");
  const uiLocale = useLocale();
  const base = `/${uiLocale}/employer`;

  const jobQuery = useQuery({
    queryKey: ["employer-job", jobId],
    queryFn: async () => readJson<{ job?: Record<string, unknown> } & Record<string, unknown>>(await fetch(`/api/jobs/${jobId}`)),
  });
  const kitQuery = useQuery({
    queryKey: ["brand-kit", "employer"],
    queryFn: async () => readJson<KitView>(await fetch("/api/employers/brand-kit")),
  });

  const [source, setSource] = useState<Source | null>(null);
  const [look, setLook] = useState<PosterLook>("bold");
  const [posterLocale, setPosterLocale] = useState<"en" | "ar">(uiLocale === "ar" ? "ar" : "en");
  const [headline, setHeadline] = useState("");
  const [headlineEdited, setHeadlineEdited] = useState(false);
  const [size, setSize] = useState<PosterSize>("square");
  const [layout, setLayout] = useState<BrandLayout>("spotlight");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [qr, setQr] = useState<string>();

  // Default to the company's own kit once it has one, Mployedin's until then.
  const effectiveSource: Source = source ?? (kitQuery.data?.isCustom ? "company" : "mployedin");

  useEffect(() => {
    if (!headlineEdited) setHeadline(defaultHeadline(look, posterLocale));
  }, [look, posterLocale, headlineEdited]);

  // Before saving, the QR opens the job itself; the saved poster's image uses the tracked link.
  useEffect(() => {
    QRCode.toDataURL(buildJobApplyUrl(jobId), { margin: 1, width: 360 }).then(setQr, () => setQr(undefined));
  }, [jobId]);

  // Any change after saving makes a new poster.
  useEffect(() => setSaved(null), [effectiveSource, look, posterLocale, headline, layout]);

  const rawJob = (jobQuery.data?.job ?? jobQuery.data) as Record<string, unknown> | undefined;
  const employer = rawJob?.employerId && typeof rawJob.employerId === "object" ? (rawJob.employerId as { companyName?: string; logo?: string }) : null;
  const job: PosterJobInput | null = rawJob
    ? { ...(rawJob as PosterJobInput), companyName: employer?.companyName ?? (rawJob.companyName as string | undefined) }
    : null;

  const view = kitQuery.data;
  const kit = view ? (effectiveSource === "company" ? view.kit : view.platform) : null;
  // The logo spot names the employer; without a company logo the name alone does (Mployedin has its own corner badge).
  const logo = view?.companyLogo || null;
  const data = useMemo(
    () => (job ? buildBrandPosterData(job, { look, locale: posterLocale, headline, companyName: kit?.displayName || view?.companyName || job.companyName, contact: view?.contact, qrDataUrl: qr }) : null),
    [job, look, posterLocale, headline, kit?.displayName, view?.companyName, view?.contact, qr],
  );

  const save = useMutation({
    mutationFn: async () =>
      readJson<Saved>(
        await fetch("/api/employers/posters/brand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, source: effectiveSource, layout, look, headline, locale: posterLocale }),
        }),
      ),
    onSuccess: (s) => {
      setSaved(s);
      toast.success(t("savedToast"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const { width, height } = POSTER_SIZES[size];
  const loading = jobQuery.isLoading || kitQuery.isLoading;
  const failed = jobQuery.isError || kitQuery.isError;

  const copyLink = async () => {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(buildPosterShareUrl(saved.shareSlug));
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyError"));
    }
  };

  return (
    <div className={`page-container ${POSTER_FONT_VARIABLES}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`${base}/jobs/${jobId}/posting`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            {t("backToJob")}
          </Link>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link href={`${base}/my-posters`}><Images className="size-4" aria-hidden />{t("myPosters")}</Link>
          </Button>
        </div>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label={t("stepsLabel")}>
        {[t("stepJob"), t("stepLook"), t("stepShare")].map((label, i) => {
          const done = i === 0 || (i === 1 && Boolean(saved));
          const current = (i === 1 && !saved) || (i === 2 && Boolean(saved));
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                current ? "border-primary bg-primary text-primary-foreground" : done ? "border-emerald-600/40 text-emerald-700" : "text-muted-foreground"
              }`}
            >
              {done && !current ? <Check className="size-4" aria-hidden /> : <span aria-hidden>{i + 1}</span>}
              {label}
            </li>
          );
        })}
      </ol>

      {failed ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{t("loadError")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { jobQuery.refetch(); kitQuery.refetch(); }}>{t("retry")}</Button>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          {/* Step 2 · Look */}
          <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="studio-look">
            <h2 id="studio-look" className="text-base font-semibold">{t("lookTitle")}</h2>
            {loading || !job ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{job.title}</span>
                  {job.companyName ? ` · ${job.companyName}` : ""}
                </p>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">{t("whoseBrand")}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(["company", "mployedin"] as Source[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={effectiveSource === s}
                        onClick={() => setSource(s)}
                        className={`flex min-h-11 flex-col items-start gap-0.5 rounded-lg border-2 p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          effectiveSource === s ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 font-semibold">
                          {s === "company" ? <Building2 className="size-4" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
                          {s === "company" ? t("brandCompany") : t("brandMployedin")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s === "company" ? (view?.isCustom ? t("brandCompanyHint") : t("brandCompanyDefaultHint")) : t("brandMployedinHint")}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!view?.isCustom && (
                    <Link href={`${base}/settings?tab=brand`} className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline">
                      {t("setUpKit")}
                    </Link>
                  )}
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">{t("style")}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(["bold", "clean", "urgent"] as PosterLook[]).map((l) => {
                      const Icon = LOOK_ICON[l];
                      return (
                        <button
                          key={l}
                          type="button"
                          aria-pressed={look === l}
                          onClick={() => setLook(l)}
                          className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            look === l ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                          }`}
                        >
                          <Icon className="size-4" aria-hidden />
                          {t(`look_${l}`)}
                        </button>
                      );
                    })}
                  </div>
                  <Link href={`${base}/jobs/${jobId}/poster?mode=ai`} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                    <Sparkles className="size-3.5" aria-hidden />
                    {t("photoLink")}
                  </Link>
                </fieldset>

                <div className="space-y-1.5">
                  <Label htmlFor="studio-headline">{t("headline")}</Label>
                  <Input
                    id="studio-headline"
                    className="min-h-11"
                    maxLength={80}
                    value={headline}
                    onChange={(e) => { setHeadline(e.target.value); setHeadlineEdited(true); }}
                  />
                  <p className="text-xs text-muted-foreground">{t("headlineHint")}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="studio-size">{t("size")}</Label>
                    <Select value={size} onValueChange={(v) => setSize(v as PosterSize)}>
                      <SelectTrigger id="studio-size" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{t(`size_${s}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="studio-lang">{t("language")}</Label>
                    <Select value={posterLocale} onValueChange={(v) => { setPosterLocale(v as "en" | "ar"); }}>
                      <SelectTrigger id="studio-lang" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar">العربية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </section>

          <div className="space-y-6 min-w-0">
            {/* Six layouts */}
            <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="studio-layouts">
              <div>
                <h2 id="studio-layouts" className="text-base font-semibold">{t("layoutsTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("layoutsHint")}</p>
              </div>
              <div className={`grid gap-3 ${size === "landscape" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
                {loading || !data || !kit
                  ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="w-full rounded-lg" style={{ aspectRatio: `${width} / ${height}` }} />)
                  : BRAND_LAYOUTS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={layout === l}
                        aria-label={t("pickLayout", { name: t(`layout_${l}`) })}
                        onClick={() => setLayout(l)}
                        className={`group rounded-lg p-1 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          layout === l ? "ring-2 ring-primary ring-offset-2" : "hover:ring-1 hover:ring-border"
                        }`}
                      >
                        <ScaledPoster
                          className="rounded-md"
                          data={data}
                          kit={kit}
                          layout={l}
                          look={look}
                          width={width}
                          height={height}
                          logoUrl={logo}
                          platformLogoUrl={MPLOYEDIN_LOGO_URL}
                        />
                        <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          {layout === l && <Check className="size-3.5 text-primary" aria-hidden />}
                          {t(`layout_${l}`)}
                        </span>
                      </button>
                    ))}
              </div>
            </section>

            {/* Step 3 · Share */}
            <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="studio-share">
              <div>
                <h2 id="studio-share" className="text-base font-semibold">{t("shareTitle")}</h2>
                <p className="text-sm text-muted-foreground">{saved ? t("shareReady") : t("shareHint")}</p>
              </div>
              {!saved ? (
                <Button onClick={() => save.mutate()} disabled={save.isPending || loading || !data} className="min-h-11 gap-2">
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {t("save")}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {SIZES.map((s) => (
                      <Button key={s} asChild variant={s === size ? "default" : "outline"} className="min-h-11 gap-2">
                        <a href={`/api/poster/${saved.shareSlug}/image?size=${s}&download=1`} download>
                          <Download className="size-4" aria-hidden />
                          {t(`size_${s}`)}
                        </a>
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={copyLink} className="min-h-11 gap-2">
                      <Copy className="size-4" aria-hidden />{t("copyLink")}
                    </Button>
                    <Button asChild variant="outline" className="min-h-11 gap-2">
                      <a href={`/${uiLocale}/poster/${saved.shareSlug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" aria-hidden />{t("openSharePage")}
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("qrNote")}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
