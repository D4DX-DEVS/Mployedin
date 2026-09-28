import mongoose from "mongoose";
import Job from "@/models/Job";
import WorkflowTemplate from "@/models/WorkflowTemplate";
import { normalizeWorkflowStageDefs, type WorkflowStageDef } from "./workflowStages";
import type { WorkflowTemplateMatchRules } from "./workflowTemplateMatch";

/** What the template screens receive. Stages are always normalised (legacy rows included). */
export interface WorkflowTemplateDTO {
  _id: string;
  name: string;
  description: string;
  scope: "system" | "employer";
  isDefault: boolean;
  isActive: boolean;
  version: number;
  priority: number;
  match: WorkflowTemplateMatchRules;
  stages: WorkflowStageDef[];
  tags: string[];
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface StoredTemplate {
  _id: unknown;
  name?: string | null;
  description?: string | null;
  scope?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
  version?: number | null;
  priority?: number | null;
  match?: WorkflowTemplateMatchRules | null;
  stages?: unknown;
  tags?: string[] | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

const iso = (value: Date | string | null | undefined): string | undefined => (value ? new Date(value).toISOString() : undefined);

function uniqueTrimmed(values: readonly string[] | null | undefined, lower = false): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(lower ? key : value);
  }
  return out;
}

/** Trimmed, de-duplicated rules; empty dimensions left out entirely. */
export function cleanMatchRules(rules: WorkflowTemplateMatchRules | null | undefined): WorkflowTemplateMatchRules {
  const out: WorkflowTemplateMatchRules = {};
  const categories = uniqueTrimmed(rules?.categories);
  const employmentTypes = uniqueTrimmed(rules?.employmentTypes, true);
  const workModes = uniqueTrimmed(rules?.workModes, true);
  const titleKeywords = uniqueTrimmed(rules?.titleKeywords);
  if (categories.length) out.categories = categories;
  if (employmentTypes.length) out.employmentTypes = employmentTypes;
  if (workModes.length) out.workModes = workModes;
  if (titleKeywords.length) out.titleKeywords = titleKeywords;
  if (typeof rules?.minExperienceYears === "number" && rules.minExperienceYears > 0) out.minExperienceYears = rules.minExperienceYears;
  return out;
}

export function serializeWorkflowTemplate(t: StoredTemplate, usageCount?: number): WorkflowTemplateDTO {
  return {
    _id: String(t._id),
    name: t.name ?? "",
    description: t.description ?? "",
    scope: t.scope === "employer" ? "employer" : "system",
    isDefault: Boolean(t.isDefault),
    isActive: t.isActive !== false,
    version: typeof t.version === "number" && t.version > 0 ? t.version : 1,
    priority: typeof t.priority === "number" ? t.priority : 0,
    match: cleanMatchRules(t.match),
    stages: normalizeWorkflowStageDefs(t.stages),
    tags: t.tags ?? [],
    ...(typeof usageCount === "number" ? { usageCount } : {}),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

/** How many jobs run on each template (any status, deleted jobs excluded). */
export async function workflowTemplateUsage(templateIds: readonly unknown[]): Promise<Map<string, number>> {
  const ids = templateIds
    .map(String)
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) return new Map();
  const rows = await Job.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { "workflow.template.templateId": { $in: ids }, deletedAt: null } },
    { $group: { _id: "$workflow.template.templateId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/** Exactly one default per scope (per employer for employer templates). */
export async function clearOtherDefaults(template: { _id: unknown; scope: string; employerId?: unknown }): Promise<void> {
  await WorkflowTemplate.updateMany(
    {
      _id: { $ne: template._id },
      scope: template.scope,
      ...(template.scope === "employer" ? { employerId: template.employerId } : {}),
      isDefault: true,
    },
    { $set: { isDefault: false } },
  );
}

/** Fields written from a validated create/update body. */
export function templateWriteFields(body: {
  name: string;
  description?: string;
  stages: WorkflowStageDef[];
  tags?: string[];
  priority?: number;
  match?: WorkflowTemplateMatchRules;
  isDefault?: boolean;
  isActive?: boolean;
}): Record<string, unknown> {
  const isActive = body.isActive ?? true;
  return {
    name: body.name,
    description: body.description ?? "",
    stages: body.stages.map((s, i) => ({ id: s.id, label: s.label, phase: s.phase, order: i + 1, enabled: true, autoProgress: false })),
    tags: body.tags ?? [],
    priority: body.priority ?? 0,
    match: cleanMatchRules(body.match),
    isActive,
    // An archived template cannot be anybody's default.
    isDefault: isActive ? Boolean(body.isDefault) : false,
  };
}
