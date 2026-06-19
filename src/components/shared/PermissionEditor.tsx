"use client";

import { useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, ShieldCheck, ShieldOff, RotateCcw, CheckCircle2 } from "lucide-react";
import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
import { ALL_RESOURCES, ALL_ACTIONS } from "@/lib/permissions/matrix";
import { getDefaultPermissionsForRole } from "@/lib/permissions/matrix";

/** Human-readable labels for resources */
const RESOURCE_LABELS: Record<Resource, string> = {
  jobs: "Jobs",
  applications: "Applications",
  interviews: "Interviews",
  placements: "Placements",
  leads: "Leads",
  commissions: "Commissions",
  employers: "Employers",
  agents: "Agents",
  job_seekers: "Job Seekers",
  super_agents: "Super Agents",
  users: "Users",
  notifications: "Notifications",
  reports: "Reports",
  audit_logs: "Audit Logs",
  ai_cv: "AI CV",
  ai_match: "AI Match",
  ai_assistant: "AI Assistant",
  tasks: "Tasks",
  job_attributes: "Job Attributes",
  location_data: "Location Data",
  cms: "CMS",
  contact_submissions: "Contact Submissions",
  offers: "Offers",
  subscriptions: "Subscriptions",
  exhibitions: "Exhibitions",
  resources: "Resources",
  targets: "Targets",
  onboarding: "Onboarding",
};

/** Human-readable labels for actions */
const ACTION_LABELS: Record<Action, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  approve: "Approve",
  export: "Export",
  impersonate: "Impersonate",
};

/** Resource categories for grouping */
const RESOURCE_GROUPS: { label: string; resources: Resource[] }[] = [
  {
    label: "Core Business",
    resources: ["jobs", "applications", "interviews", "placements", "leads", "commissions", "offers"],
  },
  {
    label: "People",
    resources: ["employers", "agents", "job_seekers", "super_agents", "users"],
  },
  {
    label: "System",
    resources: ["notifications", "reports", "audit_logs", "tasks"],
  },
  {
    label: "AI & Tools",
    resources: ["ai_cv", "ai_match", "ai_assistant"],
  },
  {
    label: "Content & Config",
    resources: ["job_attributes", "location_data", "cms", "contact_submissions"],
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(RESOURCE_GROUPS.map((g) => g.label))
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
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
        <div className="flex items-center gap-3">
          {isCustom ? (
            <ShieldCheck className="h-5 w-5 text-primary" />
          ) : (
            <Shield className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <Label className="text-sm font-medium">
              {isCustom ? "Custom Permissions" : "Role-Based Permissions"}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCustom
                ? `${totalCustomPerms} permission(s) configured`
                : `Using default ${baseRole.replace("_", " ")} permissions`}
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
          <span className="text-xs text-muted-foreground self-center mr-1">Presets:</span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("role_default")}
          >
            <RotateCcw className="h-3 w-3" /> Role Default
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("full_access")}
          >
            <CheckCircle2 className="h-3 w-3" /> Full Access
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("read_only")}
          >
            <ShieldOff className="h-3 w-3" /> Read Only
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => loadPreset("minimal")}
          >
            <ShieldOff className="h-3 w-3" /> Minimal
          </Button>
        </div>
      )}

      {/* Permission matrix */}
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {/* Header row with action names */}
        <div className="grid grid-cols-[1fr_repeat(7,40px)] items-center gap-0 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/30">
          <span>Resource</span>
          {ALL_ACTIONS.map((action) => (
            <TooltipProvider key={action} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-center truncate cursor-default">
                    {ACTION_LABELS[action].slice(0, 3)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{ACTION_LABELS[action]}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>

        {/* Resource groups */}
        {RESOURCE_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/20"
            >
              <span className={`transition-transform ${expandedGroups.has(group.label) ? "rotate-90" : ""}`}>
                ▸
              </span>
              {group.label}
            </button>

            {/* Resource rows */}
            {expandedGroups.has(group.label) &&
              group.resources.map((resource) => (
                <div
                  key={resource}
                  className="grid grid-cols-[1fr_repeat(7,40px)] items-center gap-0 px-3 py-1.5 border-b border-border/10 hover:bg-muted/10 transition-colors"
                >
                  <span className="text-sm truncate">
                    {RESOURCE_LABELS[resource]}
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
