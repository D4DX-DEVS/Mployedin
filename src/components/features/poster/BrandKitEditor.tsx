"use client";

import { useEffect } from "react";
import { useForm, useWatch, type Control, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/hooks/useConfirm";
import {
  BRAND_FONTS,
  BRAND_FONT_IDS,
  BRAND_TONES,
  MPLOYEDIN_LOGO_URL,
  brandKitSchema,
  type BrandKit,
  type PosterContact,
} from "@/lib/brand/brandKit";
import { buildBrandPosterData } from "@/lib/poster/brandPosterContent";
import { POSTER_FONT_VARIABLES } from "@/lib/brand/posterFontFaces";
import { CompanyLogoField } from "./CompanyLogoField";
import { ScaledPoster } from "./ScaledPoster";

type Mode = "employer" | "admin";

interface EmployerView { kit: BrandKit; platform: BrandKit; isCustom: boolean; companyLogo: string | null; companyName: string; contact: PosterContact }
interface AdminView { kit: BrandKit; builtIn: BrandKit; contact: PosterContact }

const ENDPOINT: Record<Mode, string> = { employer: "/api/employers/brand-kit", admin: "/api/admin/brand-kit" };

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "request failed");
  return body as T;
}

const COLOR_FIELDS = ["primary", "accent", "text", "background"] as const;

/**
 * Brand kit form with a live poster preview. Employers edit their company's
 * kit (logo comes from the company profile); admins edit the Mployedin kit
 * every employer starts from.
 */
export function BrandKitEditor({ mode }: { mode: Mode }) {
  const t = useTranslations("brandKit");
  const qc = useQueryClient();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const endpoint = ENDPOINT[mode];

  const query = useQuery({
    queryKey: ["brand-kit", mode],
    queryFn: async () => readJson<EmployerView | AdminView>(await fetch(endpoint)),
  });

  const form = useForm<BrandKit>({ resolver: zodResolver(brandKitSchema), mode: "onChange" });
  const { register, handleSubmit, reset, formState, control, setValue } = form;

  // Load the saved kit into the form when it arrives and after every save.
  useEffect(() => {
    if (!query.data) return;
    const kit = query.data.kit;
    // keepDirtyValues: a refetch (e.g. after a logo upload) must not wipe unsaved edits.
    reset({ ...kit, logoUrl: mode === "admin" ? kit.logoUrl ?? "" : "", displayName: kit.displayName ?? "" }, { keepDirtyValues: true });
  }, [query.data, reset, mode]);

  const save = useMutation({
    mutationFn: async (kit: BrandKit) =>
      readJson<EmployerView | AdminView>(
        await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kit) }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(["brand-kit", mode], data);
      qc.invalidateQueries({ queryKey: ["brand-kit"] });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const resetKit = useMutation({
    mutationFn: async () => readJson<EmployerView>(await fetch(endpoint, { method: "DELETE" })),
    onSuccess: (data) => {
      qc.setQueryData(["brand-kit", mode], data);
      qc.invalidateQueries({ queryKey: ["brand-kit"] });
      toast.success(t("resetDone"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const watched = useWatch({ control }) as Partial<BrandKit>;

  if (query.isLoading) {
    return (
      <div className="@container/brand"><div className="grid gap-6 @3xl/brand:grid-cols-[minmax(0,1fr)_minmax(0,300px)]" aria-busy="true">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
        </div>
        <Skeleton className="aspect-square w-full rounded-xl" />
      </div></div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="text-destructive">{t("loadError")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const view = query.data;
  const employerView = mode === "employer" ? (view as EmployerView) : null;
  const previewKit: BrandKit = { ...view.kit, ...stripEmpty(watched) } as BrandKit;
  const previewLogo =
    mode === "employer" ? employerView?.companyLogo || null : previewKit.logoUrl || MPLOYEDIN_LOGO_URL;
  const previewData = buildBrandPosterData(
    {
      title: t("sampleTitle"),
      location: { city: t("sampleCity") },
      employmentType: "full_time",
      qualifications: [t("sampleReq1"), t("sampleReq2"), t("sampleReq3")],
    },
    { look: "bold", companyName: (mode === "employer" && watched.displayName?.trim()) || employerView?.companyName || "Mployedin", contact: view.contact },
  );

  const onSubmit = handleSubmit((kit) =>
    save.mutate({ ...kit, logoUrl: mode === "admin" ? kit.logoUrl : undefined, displayName: mode === "employer" ? kit.displayName ?? "" : undefined }),
  );

  const onReset = async () => {
    const ok = await confirm({ title: t("resetTitle"), message: t("resetMessage"), confirmLabel: t("resetConfirm") });
    if (ok) resetKit.mutate();
  };

  const busy = save.isPending || resetKit.isPending;

  return (
    <div className={`@container/brand ${POSTER_FONT_VARIABLES}`}>
    <div className="grid gap-6 @3xl/brand:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      {ConfirmDialogNode}
      <div className="space-y-5">
        {employerView && (
          <p className="text-sm text-muted-foreground">
            {employerView.isCustom ? t("usingCustom") : t("usingDefault")}
          </p>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">{t("colours")}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorField
                key={field}
                id={`brand-${mode}-${field}`}
                label={t(`colour_${field}`)}
                name={field}
                control={control}
                onPick={(v) => setValue(field, v, { shouldDirty: true, shouldValidate: true })}
                register={register}
                error={formState.errors[field]?.message ? t("colourInvalid") : undefined}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`brand-${mode}-font`}>{t("font")}</Label>
            <Select value={watched.font ?? view.kit.font} onValueChange={(v) => setValue("font", v as BrandKit["font"], { shouldDirty: true })}>
              <SelectTrigger id={`brand-${mode}-font`} className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent className={POSTER_FONT_VARIABLES}>
                {BRAND_FONT_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    <span style={{ fontFamily: BRAND_FONTS[id].stack }}>{BRAND_FONTS[id].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`brand-${mode}-tone`}>{t("tone")}</Label>
            <Select value={watched.tone ?? view.kit.tone} onValueChange={(v) => setValue("tone", v as BrandKit["tone"], { shouldDirty: true })}>
              <SelectTrigger id={`brand-${mode}-tone`} className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BRAND_TONES.map((tone) => <SelectItem key={tone} value={tone}>{t(`tone_${tone}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("toneHint")}</p>
          </div>
        </div>

        {mode === "admin" ? (
          <div className="space-y-1.5">
            <Label htmlFor="brand-admin-logo">{t("logoUrl")}</Label>
            <Input id="brand-admin-logo" className="min-h-11" placeholder={MPLOYEDIN_LOGO_URL} {...register("logoUrl")} />
            {formState.errors.logoUrl ? (
              <p className="text-xs text-destructive">{t("logoInvalid")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("logoUrlHint")}</p>
            )}
          </div>
        ) : (
          <fieldset className="space-y-4 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">{t("companyOnPosters")}</legend>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("logo")}</p>
              <CompanyLogoField logoUrl={employerView?.companyLogo ?? null} companyName={employerView?.companyName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-employer-name">{t("displayName")}</Label>
              <Input
                id="brand-employer-name"
                className="min-h-11"
                maxLength={60}
                placeholder={employerView?.companyName}
                aria-invalid={Boolean(formState.errors.displayName)}
                {...register("displayName")}
              />
              {formState.errors.displayName ? (
                <p className="text-xs text-destructive">{t("displayNameInvalid")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("displayNameHint")}</p>
              )}
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onSubmit} disabled={busy || !formState.isValid} className="min-h-11 gap-2">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t("save")}
          </Button>
          {employerView?.isCustom && (
            <Button type="button" variant="outline" onClick={onReset} disabled={busy} className="min-h-11 gap-2">
              {resetKit.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {t("reset")}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4" aria-hidden />{t("preview")}</p>
        <ScaledPoster
          className="rounded-xl border"
          label={t("previewLabel")}
          data={previewData}
          kit={previewKit}
          layout="spotlight"
          look="bold"
          width={1080}
          height={1080}
          logoUrl={previewLogo}
          platformLogoUrl={MPLOYEDIN_LOGO_URL}
        />
        <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
      </div>
    </div>
    </div>
  );
}

function stripEmpty(kit: Partial<BrandKit>): Partial<BrandKit> {
  return Object.fromEntries(
    Object.entries(kit).filter(([key, v]) => v !== undefined && v !== "" && (key === "logoUrl" || key === "displayName" || key === "font" || key === "tone" || /^#[0-9a-fA-F]{6}$/.test(String(v)))),
  ) as Partial<BrandKit>;
}

function ColorField(props: {
  id: string;
  label: string;
  name: (typeof COLOR_FIELDS)[number];
  control: Control<BrandKit>;
  register: ReturnType<typeof useForm<BrandKit>>["register"];
  onPick: (value: string) => void;
  error?: string;
}) {
  const value = useWatch({ control: props.control, name: props.name as FieldPath<BrandKit> }) as string | undefined;
  const safe = value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={props.label}
          value={safe}
          onChange={(e) => props.onPick(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input id={props.id} className="min-h-11 font-mono uppercase" maxLength={7} {...props.register(props.name)} aria-invalid={Boolean(props.error)} />
      </div>
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}
