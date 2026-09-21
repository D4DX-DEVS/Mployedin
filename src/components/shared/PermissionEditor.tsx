"use client";

import { useState, useCallback, useMemo, useRef, useId } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, ShieldCheck, RotateCcw, Eye, Search, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
import { ALL_ACTIONS, getDefaultPermissionsForRole } from "@/lib/permissions/matrix";
import { enforcedActionsFor } from "@/lib/permissions/enforcement";

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

/* Actions are written out in full beside their checkbox now. The old matrix
   squeezed all seven into 40px columns as "Cre/Rea/Upd…", with the full name
   only in a tooltip hung off a <span> — unreachable by keyboard, and invisible
   on touch, where there is no hover at all. */
const ACTION_LABEL_KEYS: Record<Action, string> = {
  create: "actionCreate",
  read: "actionRead",
  update: "actionUpdate",
  delete: "actionDelete",
  approve: "actionApprove",
  export: "actionExport",
  impersonate: "actionImpersonate",
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

/**
 * One access level per resource replaces the 203-checkbox grid. The levels are
 * named after what an admin is actually deciding ("can they only look at
 * invoices, or change them too?"), and the individual actions stay reachable
 * behind a per-row disclosure for the rare mixed case.
 */
type AccessLevel = "none" | "view" | "edit" | "full";

const LEVEL_ORDER: AccessLevel[] = ["none", "view", "edit", "full"];

const LEVEL_ACTIONS: Record<AccessLevel, Action[]> = {
  none: [],
  view: ["read"],
  edit: ["read", "create", "update", "export"],
  full: [...ALL_ACTIONS],
};

const LEVEL_LABEL_KEYS: Record<AccessLevel, string> = {
  none: "levelNone",
  view: "levelView",
  edit: "levelEdit",
  full: "levelFull",
};

const sameSet = (a: readonly Action[], b: readonly Action[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

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
  const uid = useId();
  const [expandedRows, setExpandedRows] = useState<Set<Resource>>(new Set());
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  /* Flipping the switch off used to throw the map away, so a mis-click cost an
     admin every narrowing they had just made. The last custom map is kept here
     and handed back when the switch returns. */
  const lastCustomRef = useRef<CustomPermissions | null>(null);

  const isCustom = permissionMode === "custom";
  const roleDefaults = useMemo(() => getDefaultPermissionsForRole(baseRole), [baseRole]);

  /**
   * What this role can be granted at all. Custom permissions may only RESTRICT
   * a role (see `canAccess`), so an action outside the role's own defaults can
   * never be turned on — and an action no guard ever consults does nothing when
   * it is. Offering either would be a control that does not control anything.
   */
  const grantableFor = useCallback(
    (resource: Resource): Action[] => {
      const roleActions = roleDefaults[resource] ?? [];
      return enforcedActionsFor(resource).filter((action) => roleActions.includes(action));
    },
    [roleDefaults],
  );

  /**
   * Role-default actions with no guard behind them today. They are invisible in
   * the UI but are written back into the saved map, so that a guard added later
   * behaves like the role default instead of silently denying every custom user.
   */
  const unmanagedFor = useCallback(
    (resource: Resource): Action[] => {
      const enforced = enforcedActionsFor(resource);
      return (roleDefaults[resource] ?? []).filter((action) => !enforced.includes(action));
    },
    [roleDefaults],
  );

  const currentActions = useCallback(
    (resource: Resource): Action[] => {
      const source = isCustom ? customPermissions[resource] : roleDefaults[resource];
      return source ?? [];
    },
    [isCustom, customPermissions, roleDefaults],
  );

  /** Only the levels that produce a distinct action set for this resource. */
  const levelsFor = useCallback(
    (resource: Resource): { level: AccessLevel; actions: Action[] }[] => {
      const grantable = grantableFor(resource);
      const out: { level: AccessLevel; actions: Action[] }[] = [];
      for (const level of LEVEL_ORDER) {
        const actions = grantable.filter((a) => LEVEL_ACTIONS[level].includes(a));
        // `edit` and `full` collapse into one option when a role holds nothing
        // destructive on that resource — two buttons that do the same thing
        // read as a bug. The narrower name wins: a resource a job seeker can
        // only read offers "View", not a "Full" that grants exactly one action.
        if (out.length && sameSet(out[out.length - 1].actions, actions)) continue;
        out.push({ level, actions });
      }
      return out;
    },
    [grantableFor],
  );

  const levelOf = useCallback(
    (resource: Resource): AccessLevel | null => {
      const grantable = grantableFor(resource);
      const active = currentActions(resource).filter((a) => grantable.includes(a));
      const match = levelsFor(resource).find((l) => sameSet(l.actions, active));
      return match?.level ?? null;
    },
    [grantableFor, currentActions, levelsFor],
  );

  const writeResource = useCallback(
    (resource: Resource, nextGrantable: Action[]) => {
      const merged = [...nextGrantable, ...unmanagedFor(resource)];
      const next: CustomPermissions = { ...customPermissions };
      if (merged.length === 0) delete next[resource];
      else next[resource] = ALL_ACTIONS.filter((a) => merged.includes(a));
      lastCustomRef.current = next;
      onChange("custom", next);
    },
    [customPermissions, onChange, unmanagedFor],
  );

  const setLevel = useCallback(
    (resource: Resource, level: AccessLevel) => {
      if (readOnly || !isCustom) return;
      const target = levelsFor(resource).find((l) => l.level === level);
      writeResource(resource, target?.actions ?? []);
    },
    [readOnly, isCustom, levelsFor, writeResource],
  );

  const toggleAction = useCallback(
    (resource: Resource, action: Action) => {
      if (readOnly || !isCustom) return;
      const grantable = grantableFor(resource);
      const active = currentActions(resource).filter((a) => grantable.includes(a));
      const next = active.includes(action)
        ? active.filter((a) => a !== action)
        : [...active, action];
      writeResource(resource, next);
    },
    [readOnly, isCustom, grantableFor, currentActions, writeResource],
  );

  const toggleMode = useCallback(() => {
    if (readOnly) return;
    if (isCustom) {
      onChange("role_default", {});
    } else {
      onChange("custom", lastCustomRef.current ?? getDefaultPermissionsForRole(baseRole));
    }
  }, [isCustom, baseRole, onChange, readOnly]);

  const loadPreset = useCallback(
    (preset: "role_default" | "view_only" | "minimal") => {
      if (readOnly) return;
      let perms: CustomPermissions = {};
      if (preset === "role_default") {
        perms = getDefaultPermissionsForRole(baseRole);
      } else if (preset === "view_only") {
        for (const resource of Object.keys(roleDefaults) as Resource[]) {
          const keep = [
            ...grantableFor(resource).filter((a) => a === "read"),
            ...unmanagedFor(resource),
          ];
          if (keep.length) perms[resource] = ALL_ACTIONS.filter((a) => keep.includes(a));
        }
      } else {
        const keep = [...grantableFor("notifications"), ...unmanagedFor("notifications")]
          .filter((a) => a === "read" || !enforcedActionsFor("notifications").includes(a));
        if (keep.length) perms.notifications = ALL_ACTIONS.filter((a) => keep.includes(a));
      }
      lastCustomRef.current = perms;
      onChange("custom", perms);
    },
    [baseRole, roleDefaults, grantableFor, unmanagedFor, onChange, readOnly],
  );

  const toggleRow = (resource: Resource) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) next.delete(resource);
      else next.add(resource);
      return next;
    });

  /** Rows this role can actually be granted, already filtered by the toolbar. */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return RESOURCE_GROUPS.map((group) => ({
      ...group,
      rows: group.resources.filter((resource) => {
        if (grantableFor(resource).length === 0) return false;
        if (needle && !t(RESOURCE_LABEL_KEYS[resource]).toLowerCase().includes(needle)) return false;
        if (changedOnly) {
          const grantable = grantableFor(resource);
          const active = currentActions(resource).filter((a) => grantable.includes(a));
          if (active.length === grantable.length) return false;
        }
        return true;
      }),
    })).filter((group) => group.rows.length > 0);
  }, [query, changedOnly, grantableFor, currentActions, t]);

  const unavailable = useMemo(
    () =>
      RESOURCE_GROUPS.flatMap((g) => g.resources).filter(
        (resource) => grantableFor(resource).length === 0,
      ),
    [grantableFor],
  );

  const stats = useMemo(() => {
    let granted = 0;
    let total = 0;
    let resources = 0;
    for (const group of RESOURCE_GROUPS) {
      for (const resource of group.resources) {
        const grantable = grantableFor(resource);
        if (!grantable.length) continue;
        const active = currentActions(resource).filter((a) => grantable.includes(a));
        granted += active.length;
        total += grantable.length;
        if (active.length) resources += 1;
      }
    }
    return { granted, total, resources };
  }, [grantableFor, currentActions]);

  const rowCount = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const filtering = query.trim().length > 0 || changedOnly;

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 chip-pad">
        <div className="flex min-w-0 items-center gap-3">
          {isCustom ? (
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Shield className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            {/* The label names what the switch turns on, not the state it is in
                — "Role-Based Permissions" beside an off switch read as if the
                role defaults themselves were disabled. */}
            <Label htmlFor={`${uid}-mode`} className="text-sm font-medium">
              {t("customPermissions")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {/* Naming the consequence — this user stops following the role —
                  rather than restating the count the summary line already
                  carries below the list. */}
              {isCustom
                ? t("overrideRole", { role: baseRole.replace("_", " ") })
                : t("usingDefault", { role: baseRole.replace("_", " ") })}
            </p>
          </div>
        </div>
        {!readOnly && (
          <Switch
            id={`${uid}-mode`}
            className="tap-target-box shrink-0"
            checked={isCustom}
            onCheckedChange={toggleMode}
          />
        )}
      </div>

      {/* Presets */}
      {isCustom && !readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("presets")}:</span>
          <Button type="button" variant="outline" size="xs" onClick={() => loadPreset("role_default")}>
            <RotateCcw className="h-3 w-3" /> {t("roleDefault")}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={() => loadPreset("view_only")}>
            <Eye className="h-3 w-3" /> {t("readOnly")}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={() => loadPreset("minimal")}>
            <Shield className="h-3 w-3" /> {t("minimal")}
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchResources")}
            aria-label={t("searchResources")}
            className="h-9 ps-8 pe-10 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="absolute end-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* A list that stops after two rows reads as a broken list unless it
            says how many rows the filter kept — and the count has to be live,
            because the filter is applied as the admin types. */}
        {filtering && (
          <span role="status" className="shrink-0 text-xs text-muted-foreground">
            {t("matchingCount", { count: rowCount })}
          </span>
        )}
        {isCustom && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              className="tap-target-box"
              checked={changedOnly}
              onCheckedChange={(v) => setChangedOnly(v === true)}
            />
            {t("changedOnly")}
          </label>
        )}
      </div>

      {/* Resource list */}
      <div className="overflow-hidden rounded-lg border border-border/50">
        {rowCount === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("noResourcesMatch")}</p>
        ) : (
          groups.map((group) => (
            <div key={group.id}>
              <div className="border-b border-border/20 bg-muted/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(group.labelKey)}
              </div>

              {group.rows.map((resource) => {
                const grantable = grantableFor(resource);
                const active = currentActions(resource).filter((a) => grantable.includes(a));
                const level = levelOf(resource);
                const levels = levelsFor(resource);
                const narrowed = active.length !== grantable.length;
                const expanded = expandedRows.has(resource);

                return (
                  <div key={resource} className="border-b border-border/10 last:border-b-0">
                    <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm">{t(RESOURCE_LABEL_KEYS[resource])}</span>
                        {narrowed && (
                          <span
                            aria-label={t("changedFromDefault")}
                            title={t("changedFromDefault")}
                            className="size-1.5 shrink-0 rounded-full bg-amber-500"
                          />
                        )}
                        {level === null && (
                          <Badge variant="outline" className="shrink-0 text-[11px]">{t("levelCustom")}</Badge>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* Radio inputs rather than styled buttons: keyboard and
                            screen-reader support comes for free, and the group
                            announces the resource it belongs to. */}
                        <fieldset
                          className="flex items-center rounded-lg border border-border/60 p-0.5"
                          disabled={!isCustom || readOnly}
                        >
                          <legend className="sr-only">
                            {t("accessLevelFor", { resource: t(RESOURCE_LABEL_KEYS[resource]) })}
                          </legend>
                          {levels.map(({ level: option }) => (
                            <label
                              key={option}
                              className={`cursor-pointer rounded-md px-2 py-1 text-xs transition-colors ${
                                level === option
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:bg-muted/60"
                              } ${!isCustom || readOnly ? "cursor-default opacity-70" : ""}`}
                            >
                              <input
                                type="radio"
                                className="sr-only"
                                name={`${uid}-${resource}`}
                                value={option}
                                checked={level === option}
                                disabled={!isCustom || readOnly}
                                onChange={() => setLevel(resource, option)}
                              />
                              {t(LEVEL_LABEL_KEYS[option])}
                            </label>
                          ))}
                        </fieldset>

                        {/* A resource with a single grantable action has nothing
                            to customise, but the slot still holds its width so
                            the level controls line up down the column. */}
                        {grantable.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-12 shrink-0 gap-1 px-2 text-xs text-muted-foreground max-sm:min-h-11"
                            aria-expanded={expanded}
                            aria-label={t("customiseActionsFor", { resource: t(RESOURCE_LABEL_KEYS[resource]) })}
                            onClick={() => toggleRow(resource)}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            <ChevronRight
                              aria-hidden
                              className={`size-3.5 transition-transform rtl:-scale-x-100 ${expanded ? "rotate-90" : ""}`}
                            />
                          </Button>
                        ) : (
                          <span aria-hidden className="h-8 w-12 shrink-0" />
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/10 bg-muted/10 px-3 py-2">
                        {grantable.map((action) => (
                          <label
                            key={action}
                            className={`flex items-center gap-2 text-xs ${isCustom && !readOnly ? "cursor-pointer" : "cursor-default opacity-70"}`}
                          >
                            <Checkbox
                              className="tap-target-box"
                              checked={active.includes(action)}
                              disabled={!isCustom || readOnly}
                              onCheckedChange={() => toggleAction(resource, action)}
                            />
                            {t(ACTION_LABEL_KEYS[action])}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* What this role can never be granted, and why it is not on screen. */}
      {unavailable.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowUnavailable((v) => !v)}
            aria-expanded={showUnavailable}
            className="flex w-full items-center gap-2 text-start text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              aria-hidden
              className={`size-3.5 shrink-0 transition-transform rtl:-scale-x-100 ${showUnavailable ? "rotate-90" : ""}`}
            />
            {t("notAvailableCount", { count: unavailable.length, role: baseRole.replace("_", " ") })}
          </button>
          {showUnavailable && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">{t("notAvailableExplain")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unavailable.map((resource) => (
                  <Badge key={resource} variant="secondary" className="text-[11px]">
                    {t(RESOURCE_LABEL_KEYS[resource])}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {isCustom && (
        <p className="text-xs text-muted-foreground">
          {t("summaryLine", {
            resources: stats.resources,
            granted: stats.granted,
            total: stats.total,
          })}
        </p>
      )}
    </div>
  );
}
