"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/shared/FieldError";
import { csrfFetch } from "@/lib/security/csrf-client";
import { toast } from "sonner";
import { Edit, Loader2 } from "lucide-react";

const editSchema = z.object({
  jobTarget: z.number().int().min(0),
  conversionTarget: z.number().int().min(0),
  revenueTarget: z.number().finite().min(0),
  reason: z.string().max(500).optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditTargetsDialogProps {
  profileId: string;
  initialData: {
    jobTarget?: number;
    conversionTarget?: number;
    revenueTarget?: number;
    setByRole?: string;
    currency?: string;
  };
  onSuccess?: () => void;
  /** Controlled from a row menu: no trigger button is drawn. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Edit a target's three yearly figures. The server re-splits the months
 * equally, so they always add up to the new totals.
 */
export function EditTargetsDialog({ profileId, initialData, onSuccess, open: openProp, onOpenChange }: EditTargetsDialogProps) {
  const t = useTranslations("profitTargets");
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOpenState(next));
  const queryClient = useQueryClient();

  const defaults = {
    jobTarget: initialData.jobTarget ?? 0,
    conversionTarget: initialData.conversionTarget ?? 0,
    revenueTarget: initialData.revenueTarget ?? 0,
    reason: "",
  };
  const { register, handleSubmit, formState: { errors }, reset } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: defaults,
  });
  // Opening shows the target as it is now, not what was typed last time.
  useEffect(() => {
    if (open) reset(defaults);
     
  }, [open, profileId]);

  const mutation = useMutation({
    mutationFn: async (values: EditFormValues) => {
      const res = await csrfFetch(`/api/admin/target-profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTarget: values.jobTarget,
          conversionTarget: values.conversionTarget,
          revenueTarget: values.revenueTarget,
          distributionStrategy: "equal",
          reason: values.reason?.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`edit ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "target-profile", profileId] });
      void queryClient.invalidateQueries({ queryKey: ["target-history", profileId] });
      toast.success(t("targetsSaved"));
      setOpen(false);
      onSuccess?.();
    },
    onError: () => toast.error(t("editError")),
  });

  return (
    <>
      {!controlled && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
          <Edit className="size-4" /> {t("editTargets")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTargets")}</DialogTitle>
            <DialogDescription>{t("editTargetsDescription")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <div>
              <Label htmlFor={`jobTarget-${profileId}`}>{t("jobTarget")}</Label>
              <Input id={`jobTarget-${profileId}`} type="number" min="0" step="1" inputMode="numeric" aria-describedby={errors.jobTarget ? "jobTarget-error" : undefined} {...register("jobTarget", { valueAsNumber: true })} className="mt-1" />
              {errors.jobTarget && <FieldError id="jobTarget-error" message={t("wholeNumberError")} />}
            </div>

            <div>
              <Label htmlFor={`conversionTarget-${profileId}`}>{t("conversionTarget")}</Label>
              <Input id={`conversionTarget-${profileId}`} type="number" min="0" step="1" inputMode="numeric" aria-describedby={errors.conversionTarget ? "conversionTarget-error" : "conversionTarget-hint"} {...register("conversionTarget", { valueAsNumber: true })} className="mt-1" />
              <p id="conversionTarget-hint" className="mt-1 text-xs text-muted-foreground">{t("onboardedHires")}</p>
              {errors.conversionTarget && <FieldError id="conversionTarget-error" message={t("wholeNumberError")} />}
            </div>

            <div>
              <Label htmlFor={`revenueTarget-${profileId}`}>
                {t("revenueTarget")}{initialData.currency ? ` (${initialData.currency})` : ""}
              </Label>
              <Input id={`revenueTarget-${profileId}`} type="number" min="0" step="0.01" inputMode="decimal" aria-describedby={errors.revenueTarget ? "revenueTarget-error" : undefined} {...register("revenueTarget", { valueAsNumber: true })} className="mt-1" />
              {errors.revenueTarget && <FieldError id="revenueTarget-error" message={t("amountInvalid")} />}
            </div>

            {initialData.setByRole === "super_agent" && (
              <div>
                <Label htmlFor={`reason-${profileId}`}>{t("changeReason")}</Label>
                <Textarea id={`reason-${profileId}`} placeholder={t("reasonPlaceholder")} aria-describedby="reason-hint" {...register("reason")} className="mt-1" rows={3} />
                <p id="reason-hint" className="mt-1 text-xs text-muted-foreground">{t("reasonRequired")}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending} className="min-h-11 flex-1">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="min-h-11 flex-1 gap-2">
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {mutation.isPending ? t("saving") : t("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
