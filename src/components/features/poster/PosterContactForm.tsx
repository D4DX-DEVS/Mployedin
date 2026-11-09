"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { posterContactSchema, type BrandKit, type PosterContact } from "@/lib/brand/brandKit";

interface AdminView { kit: BrandKit; builtIn: BrandKit; contact: PosterContact }

const ENDPOINT = "/api/admin/brand-kit";

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || "request failed");
  return body as T;
}

/**
 * Mployedin's email and phone printed on every poster ("For enquiries"); applications go through the portal.
 * Owner decision 2026-11-09: one contact line for all posters, whatever the brand.
 */
export function PosterContactForm() {
  const t = useTranslations("brandKit");
  const qc = useQueryClient();
  // Same query as the admin kit editor, so both read one response.
  const query = useQuery({
    queryKey: ["brand-kit", "admin"],
    queryFn: async () => readJson<AdminView>(await fetch(ENDPOINT)),
  });

  const form = useForm<PosterContact>({ resolver: zodResolver(posterContactSchema), mode: "onChange", defaultValues: { email: "", phone: "" } });
  const { register, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (query.data?.contact) reset(query.data.contact);
  }, [query.data, reset]);

  const save = useMutation({
    mutationFn: async (contact: PosterContact) =>
      readJson<AdminView>(
        await fetch(ENDPOINT, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contact) }),
      ),
    onSuccess: (data) => {
      qc.setQueryData(["brand-kit", "admin"], data);
      qc.invalidateQueries({ queryKey: ["brand-kit"] });
      toast.success(t("contactSaved"));
    },
    onError: () => toast.error(t("saveError")),
  });

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="text-destructive">{t("loadError")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
      <div>
        <h3 className="text-sm font-semibold">{t("contactTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("contactDesc")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="poster-contact-email">{t("contactEmail")}</Label>
          <Input id="poster-contact-email" type="email" className="min-h-11" placeholder="support@mployedin.com" aria-invalid={Boolean(formState.errors.email)} {...register("email")} />
          {formState.errors.email ? <p className="text-xs text-destructive">{t("contactEmailInvalid")}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="poster-contact-phone">{t("contactPhone")}</Label>
          <Input id="poster-contact-phone" type="tel" className="min-h-11" placeholder="+971 4 000 0000" aria-invalid={Boolean(formState.errors.phone)} {...register("phone")} />
          {formState.errors.phone ? (
            <p className="text-xs text-destructive">{t("contactPhoneInvalid")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("contactPhoneHint")}</p>
          )}
        </div>
      </div>
      <Button type="submit" disabled={save.isPending || !formState.isValid || !formState.isDirty} className="min-h-11 gap-2">
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {t("contactSave")}
      </Button>
    </form>
  );
}
