"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { useProfileVisibility, useSetProfileVisibility } from "@/hooks/useDataPrivacy";

/**
 * Job seekers only: the "Let employers find me" switch, here as well as in
 * Settings, so the person can stop being searchable from the page about their
 * data. Writes the same JobSeeker.profileVisibility.
 */
export function ProfileVisibilityControl() {
  const t = useTranslations("dataPrivacy");
  const visibility = useProfileVisibility(true);
  const save = useSetProfileVisibility();

  if (visibility.isLoading) return <Skeleton className="h-16 w-full rounded-lg" />;
  if (visibility.isError) return <ErrorState description={t("visibilityError")} onRetry={() => void visibility.refetch()} retryLabel={t("retry")} />;

  const visible = (save.isPending ? save.variables : visibility.data) === "visible";
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0">
        <Label htmlFor="privacy-discoverable" className="text-sm font-medium text-foreground">
          {t("visibilitySwitch")}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {visible ? t("visibilityOn") : t("visibilityOff")}
        </p>
      </div>
      <Switch
        id="privacy-discoverable"
        checked={visible}
        disabled={save.isPending}
        onCheckedChange={(on) =>
          save.mutate(on ? "visible" : "hidden", {
            onSuccess: () => toast.success(on ? t("visibilitySavedOn") : t("visibilitySavedOff")),
            onError: () => toast.error(t("visibilitySaveError")),
          })
        }
      />
    </div>
  );
}
