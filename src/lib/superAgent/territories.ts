import { z } from "zod";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";
import City from "@/models/City";
import State from "@/models/State";
import type { AssignedRegion } from "@/lib/agents/assignedRegion";
import type { RegionConflict } from "@/lib/superAgent/regions";

/** One row of the admin Territories table. */
export interface TerritoryRow {
  /** Territory id, or `sa:<userId>` for a super agent whose region has no name yet. */
  key: string;
  territoryId: string | null;
  name: string | null;
  superAgent: { userId: string; name: string; email: string; avatar: string | null } | null;
  regions: AssignedRegion[];
  cityIds: string[];
  stateIds: string[];
  agentCount: number;
  updatedAt: string | null;
}

/** A live super agent, as the Territory form's picker offers them. */
export interface TerritorySuperAgentOption {
  userId: string;
  name: string;
  email: string;
  /** Their named territory, if any — one per super agent. */
  territoryId: string | null;
  cityIds: string[];
  stateIds: string[];
}

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const ids = z.array(objectId).max(500);

export const territoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a territory name").max(100),
    superAgentId: objectId,
    cityIds: ids.default([]),
    stateIds: ids.default([]),
  })
  .refine((v) => v.cityIds.length + v.stateIds.length > 0, {
    message: "Pick at least one state or city",
    path: ["cityIds"],
  });

export const territoryUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter a territory name").max(100).optional(),
  superAgentId: objectId.optional(),
  cityIds: ids.optional(),
  stateIds: ids.optional(),
});

/** Null when the id names a live super agent; otherwise why not. */
export async function superAgentUserError(userId: string): Promise<string | null> {
  const [user, profile] = await Promise.all([
    User.findById(userId).select("role").lean(),
    SuperAgent.findOne({ userId, roleArchivedAt: null }).select("_id").lean(),
  ]);
  if (!user || user.role !== "super_agent" || !profile) return "Pick an active super agent";
  return null;
}

/** Null when every id is a real city / state in Master Data. */
export async function regionIdsError(cityIds: string[], stateIds: string[]): Promise<string | null> {
  const [cities, states] = await Promise.all([
    cityIds.length ? City.countDocuments({ _id: { $in: cityIds } }) : 0,
    stateIds.length ? State.countDocuments({ _id: { $in: stateIds } }) : 0,
  ]);
  if (cities !== new Set(cityIds).size || states !== new Set(stateIds).size) {
    return "One of the picked places no longer exists in Master Data. Reopen the form and pick again.";
  }
  return null;
}

/** Same warning shape the Super Agents form already shows for overlaps. */
export function regionWarnings(conflicts: RegionConflict[]) {
  if (conflicts.length === 0) return {};
  return {
    warnings: [{
      type: "region_overlap" as const,
      message: `Region overlap detected with ${conflicts.length} other super agent(s).`,
      conflicts,
    }],
  };
}
