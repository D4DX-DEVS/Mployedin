"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, ShieldCheck, ShieldOff, RotateCcw, CheckCircle2, ChevronRight } from "lucide-react";
import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
import { ALL_RESOURCES, ALL_ACTIONS } from "@/lib/permissions/matrix";
import { getDefaultPermissionsForRole } from "@/lib/permissions/matrix";

/** Message keys for resource names */
const RESOURCE_LABEL_KEYS: Record<Resource, string> = {
  jobs: "resourceJobs",
  applications: "resourceApplications",
  interviews: "resourceInterviews",
  placements: "resourcePlacements",
  leads: "resourceLeads",
  commissions: "resourceCommissions",
  employers: "resourceEmployers",
  agents: "resourceAgents",
  job_seekers: "resourceJobSeekers",
  super_agents: "resourceSuperAgents",
  users: "resourceUsers",
  notifications: "resourceNotifications",
  reports: "resourceReports",
  audit_logs: "resourceAuditLogs",
  ai_cv: "resourceAiCv",
  ai_match: "resourceAiMatch",
  ai_assistant: "resourceAiAssistant",
  tasks: "resourceTasks",
  job_attributes: "resourceJobAttributes",
  location_data: "resourceLocationData",
  cms: "resourceCms",
  contact_submissions: "resourceContactSubmissions",
  offers: "resourceOffers",
  subscriptions: "resourceSubscriptions",
  exhibitions: "resourceExhibitions",
  resources: "resourceResources",
  targets: "resourceTargets",
  onboarding: "resourceOnboarding",
  invoices: "resourceInvoices",
};

/* Two keys per action: the full name for the tooltip, and a separate short form
   for the 40px column header. The header used to be `label.slice(0, 3)`, which
   only ever produced a readable abbreviation in English — slicing Arabic at
   three characters cuts a word mid-letterform. */
const ACTION_LABEL_KEYS: Record<Action, { full: string; short: string }> = {
  create: { full: "actionCreate", short: "actionCreateShort" },
  read: { full: "actionRead", short: "actionReadShort" },
  update: { full: "actionUpdate", short: "actionUpdateShort" },
  delete: { full: "actionDelete", short: "actionDeleteShort" },
  approve: { full: "actionApprove", short: "actionApproveShort" },
  export: { full: "actionExport", short: "actionExportShort" },
  impersonate: { full: "actionImpersonate", short: "actionImpersonateShort" },
};

/** Resource categories for grouping. `id` is the stable expand/collapse key. */
const RESOURCE_GROUPS: { id: string; labelKey: string; resources: Resource[] }[] = [
  {
    id: "core",
    labelKey: "groupCoreBusiness",
    resources: ["jobs", "applications", "interviews", "placements", "leads", "commissions", "offers", "exhibitions"],
  },
  {
    id: "people",
    labelKey: "groupPeople",
    resources: ["employers", "agents", "job_seekers", "super_agents", "users"],
  },
  {
    id: "system",
    labelKey: "groupSystem",
    resources: ["notifications", "reports", "audit_logs", "tasks", "onboarding"],
  },
  {
    id: "ai",
    labelKey: "groupAiTools",
    resources: ["ai_cv", "ai_match", "ai_assistant"],
  },
  {
    id: "content",
    labelKey: "groupContentConfig",
    resources: ["job_attributes", "location_data", "cms", "contact_submissions", "resources"],
  },
  {
    id: "finance",
    labelKey: "groupFinancePerformance",
    resources: ["subscriptions", "invoices", "targets"],
  },
];

interface PermissionEditorProps {
  /** The user's base role (used for loading defaults) */
  baseRole: UserRole;
  /** Current permission mode */
  permissionMode: PermissionMode;
  /** Current custom permissions (only used when mode is "custom") */
  customPermissions: CustomPermissions;
  /** Called when permission mode or permissions change */
  onChange: (permissionMode: PermissionMode, customPermissions: CustomPermissions) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
}

export function PermissionEditor({
  baseRole,
  permissionMode,
  customPermissions,
  onChange,
  readOnly = false,
}: PermissionEditorProps) {
  const t = useTranslations("permissionEditor");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(RESOURCE_GROUPS.map((g) => g.id))
  );

  const isCustom = permissionMode === "custom";

  const toggleMode = useCallback(() => {
    if (readOnly) return;
    if (isCustom) {
      onChange("role_default", {});
    } else {
      // Switch to custom: pre-fill with the role's default permissions
      const defaults = getDefaultPermissionsForRole(baseRole);
      onChange("custom", defaults);
    }
  }, [isCustom, baseRole, onChange, readOnly]);

  const togglePermission = useCallback(
    (resource: Resource, action: Action) => {
      if (readOnly || !isCustom) return;
      const current = customPermissions[resource] ?? [];
      const has = current.includes(action);
      const updated = has
        ? current.filter((a) => a !== action)
        : [...current, action];

      const newPerms = { ...customPermissions };
      if (updated.length === 0) {
        delete newPerms[resource];
      } else {
        newPerms[resource] = updated as Action[];
      }
      onChange("custom", newPerms);
    },
    [isCustom, customPermissions, onChange, readOnly]
  );

  const roleDefaults = useMemo(() => getDefaultPermissionsForRole(baseRole), [baseRole]);

  const hasPermission = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (isCustom) {
        return customPermissions[resource]?.includes(action) ?? false;
      }
      return roleDefaults[resource]?.includes(action) ?? false;
    },
    [isCustom, customPermissions, roleDefaults]
  );

  const loadPreset = useCallback(
    (preset: "role_default" | "full_access" | "read_only" | "minimal") => {
      if (readOnly) return;
      let perms: CustomPermissions = {};
      switch (preset) {
        case "role_default":
          perms = getDefaultPermissionsForRole(baseRole);
          break;
        case "full_access":
          perms = getDefaultPermissionsForRole("admin");
          break;
        case "read_only":
          for (const r of ALL_RESOURCES) {
            perms[r] = ["read"];
          }
          break;
        case "minimal":
          perms = { notifications: ["read"] };
          break;
      }
      onChange("custom", perms);
    },
    [baseRole, onChange, readOnly]
  );

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const totalCustomPerms = useMemo(() => {
    if (!isCustom) return 0;
    return Object.values(customPermissions).reduce(
      (sum, actions) => sum + (actions?.length ?? 0),
      0
    );
  }, [isCustom, customPermissions]);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 chip-pad">
        <div className="flex items-center gap-3">
          {isCustom ? (
            <ShieldCheck className="h-5 w-5 text-primary" />
          ) : (
            <Shield className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label className="text-sm font-medium">
              {isCustom ? t("customPermissions") : t("roleBasedPermissions")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCustom
                ? t("permissionsConfigured", { count: totalCustomPerms })
                : t("usingDefault", { role: baseRole.replace("_", " ") })}
            </p>
          </div>
        </div>
        {!readOnly && (
          <Switch checked={isCustom} onCheckedChange={toggleMode} />
        )}
      </div>

      {/* Presets (only in custom mode) */}
      {isCustom && !readOnly && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">{t("presets")}:</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("role_default")}
          >
            <RotateCcw className="h-3 w-3" /> {t("roleDefault")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("full_access")}
          >
            <CheckCircle2 className="h-3 w-3" /> {t("fullAccess")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("read_only")}
          >
            <ShieldOff className="h-3 w-3" /> {t("readOnly")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("minimal")}
          >
            <ShieldOff className="h-3 w-3" /> {t("minimal")}
          </Button>
        </div>
      )}

      {/* Permission matrix */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {/* Header row with action names */}
        <div className="grid grid-cols-[1fr_repeat(7,40px)] items-center gap-0 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/30">
          <span>{t("resourceColumnHeader")}</span>
          {ALL_ACTIONS.map((action) => (
            <TooltipProvider key={action} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center truncate cursor-default">
                    {t(ACTION_LABEL_KEYS[action].short)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{t(ACTION_LABEL_KEYS[action].full)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Resource groups */}
        {RESOURCE_GROUPS.map((group) => (
          <div key={group.id}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 bg-muted/20 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/20 panel-head"
            >
              {/* Lucide chevron rather than a "▸" glyph: the glyph always points
                  right, so in Arabic it pointed away from the content it opens. */}
              <ChevronRight
                aria-hidden
                className={`size-4 shrink-0 transition-transform rtl:-scale-x-100 ${expandedGroups.has(group.id) ? "rotate-90" : ""}`}
              />
              {t(group.labelKey)}
            </button>

            {/* Resource rows */}
            {expandedGroups.has(group.id) &&
              group.resources.map((resource) => (
                <div
                  key={resource}
                  className="grid grid-cols-[1fr_repeat(7,40px)] items-center gap-0 px-3 py-1.5 border-b border-border/10 hover:bg-muted/10 transition-colors"
                >
                  <span className="text-sm truncate">
                    {t(RESOURCE_LABEL_KEYS[resource])}
                  </span>
                  {ALL_ACTIONS.map((action) => {
                    const checked = hasPermission(resource, action);
                    const canToggle = isCustom && !readOnly;

                    return (
                      <div
                        key={action}
                        className="flex items-center justify-center"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePermission(resource, action)}
                          disabled={!canToggle}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Summary */}
      {isCustom && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {Object.keys(customPermissions).length} resources
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {totalCustomPerms} permissions
          </Badge>
        </div>
      )}
    </div>
  );
}
