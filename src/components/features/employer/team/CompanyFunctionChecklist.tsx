"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
// From the Mongoose-free module, not the model: this is a client component,
// and importing the model pulls the driver into the browser bundle.
import {
  COMPANY_FUNCTIONS,
  computeEffectivePermissions,
  type CompanyRole,
  type PermissionFlag,
} from "@/lib/permissions/companyRoles";

/**
 * The eleven grantable functions, with a static translation key each.
 *
 * Deliberately a literal map rather than `t(\`functions.${flag}\`)`. A template
 * literal builds keys no parity check and no type-checker can see, and
 * next-intl throws on a key that turns out not to exist, taking the page down.
 */
const FUNCTION_LABEL_KEYS: Record<PermissionFlag, string> = {
  canCreateJobs: "functions.canCreateJobs",
  canReviewApplicants: "functions.canReviewApplicants",
  canScheduleInterviews: "functions.canScheduleInterviews",
  canSendOffers: "functions.canSendOffers",
  canOnboardPlacements: "functions.canOnboardPlacements",
  canRunScreening: "functions.canRunScreening",
  canManageTalentPools: "functions.canManageTalentPools",
  canManageBilling: "functions.canManageBilling",
  canViewAnalytics: "functions.canViewAnalytics",
  canManageCompanySettings: "functions.canManageCompanySettings",
  canManageTeam: "functions.canManageTeam",
  // Legacy flags stay role-derived and are never shown in the checklist. They
  // are listed here only so the map stays exhaustive over PermissionFlag.
  canExportData: "",
  canViewReports: "",
  canApproveInvoices: "",
  canViewCommissions: "",
};

interface CompanyFunctionChecklistProps {
  /** The roles currently selected for this person. */
  roles: CompanyRole[];
  /** The employer's manual ticks on top of those roles. */
  overrides: Partial<Record<PermissionFlag, boolean>>;
  onChange: (overrides: Partial<Record<PermissionFlag, boolean>>) => void;
  /** Open on first render, for the edit dialog where the ticks already matter. */
  defaultOpen?: boolean;
}

/**
 * Lets an employer grant a colleague exactly the functions they should have.
 *
 * The role picker above sets sensible defaults. This panel is for the cases a
 * role does not describe: someone who only runs background checks, or a hiring
 * manager who must not send offers. A tick that matches the role default is
 * dropped from the overrides rather than stored, so changing the role later
 * still moves the boxes the employer never touched.
 */
export function CompanyFunctionChecklist({
  roles,
  overrides,
  onChange,
  defaultOpen = false,
}: CompanyFunctionChecklistProps) {
  const t = useTranslations("employerTeam");
  const [open, setOpen] = useState(defaultOpen);

  const roleDefaults = useMemo(() => computeEffectivePermissions(roles), [roles]);
  const effective = useMemo(
    () => computeEffectivePermissions(roles, overrides),
    [roles, overrides]
  );

  const grantedCount = COMPANY_FUNCTIONS.filter((flag) => effective[flag]).length;

  function toggle(flag: PermissionFlag, next: boolean) {
    const updated = { ...overrides };
    if (next === roleDefaults[flag]) {
      // Back in line with the role, so there is nothing to remember.
      delete updated[flag];
    } else {
      updated[flag] = next;
    }
    onChange(updated);
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-start min-h-11"
      >
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{t("fineTune")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("fineTuneCount", { count: grantedCount, total: COMPANY_FUNCTIONS.length })}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3 space-y-1">
          <p className="text-xs text-muted-foreground pb-1">{t("fineTuneHint")}</p>
          {COMPANY_FUNCTIONS.map((flag) => {
            const checked = effective[flag] === true;
            const changed = overrides[flag] !== undefined;
            return (
              <label
                key={flag}
                htmlFor={`fn-${flag}`}
                className="flex items-center gap-3 rounded-md px-1 py-2 min-h-11 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  id={`fn-${flag}`}
                  checked={checked}
                  onCheckedChange={(v) => toggle(flag, v === true)}
                  className="tap-target-box"
                />
                <span className="text-sm text-foreground flex-1">
                  {t(FUNCTION_LABEL_KEYS[flag])}
                </span>
                {changed && (
                  <span className="text-[11px] text-muted-foreground">{t("fineTuneChanged")}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
