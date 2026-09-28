import mongoose from "mongoose";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import City from "@/models/City";
import { expandStatesToCities } from "@/lib/auth/agentRestrictions";

/**
 * A super agent's region: the cities and states an admin handed them. It lives
 * on the SuperAgent profile (`assignedCityIds` / `assignedStateIds`) and nowhere
 * else — the admin Super Agents form and the admin Territories page both write
 * it through here, and every super-agent screen and scope helper reads it.
 */
export interface RegionIds {
  cityIds: string[];
  stateIds: string[];
}

export interface RegionConflict {
  superAgentName: string;
  overlappingCities: number;
  overlappingStates: number;
}

type IdLike = mongoose.Types.ObjectId | string;

const toIds = (ids: readonly IdLike[] | null | undefined): string[] => (ids ?? []).map(String);
const toObjectIds = (ids: readonly string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));

/**
 * Other live super agents whose region overlaps this one. Overlap is a warning,
 * not a refusal: two super agents may share a state on purpose.
 *
 * A city counts as shared when the other side holds it directly or holds the
 * state it sits in, so "Tirur" against "Kerala" is an overlap. (The first
 * version compared city ids to city ids only and missed exactly that case.)
 */
export async function findRegionOverlaps(saUserId: string, region: RegionIds): Promise<RegionConflict[]> {
  if (region.cityIds.length === 0 && region.stateIds.length === 0) return [];

  const others = await SuperAgent.find({ userId: { $ne: saUserId }, roleArchivedAt: null })
    .select("userId assignedCityIds assignedStateIds")
    .lean();
  if (others.length === 0) return [];

  const allCityIds = new Set(region.cityIds);
  for (const other of others) for (const id of toIds(other.assignedCityIds)) allCityIds.add(id);
  const cityDocs = allCityIds.size
    ? await City.find({ _id: { $in: [...allCityIds] } }).select("stateId").lean()
    : [];
  const stateOfCity = new Map(cityDocs.map((c) => [String(c._id), String(c.stateId ?? "")]));

  const myCities = new Set(region.cityIds);
  const myStates = new Set(region.stateIds);
  const overlaps: { userId: string; cities: number; states: number }[] = [];

  for (const other of others) {
    const theirCities = new Set(toIds(other.assignedCityIds));
    const theirStates = new Set(toIds(other.assignedStateIds));

    const states = [...myStates].filter((id) => theirStates.has(id)).length;
    const mineInTheirs = region.cityIds.filter(
      (id) => theirCities.has(id) || theirStates.has(stateOfCity.get(id) ?? ""),
    ).length;
    const theirsInMine = [...theirCities].filter(
      (id) => !myCities.has(id) && myStates.has(stateOfCity.get(id) ?? ""),
    ).length;
    const cities = mineInTheirs + theirsInMine;

    if (cities > 0 || states > 0) overlaps.push({ userId: String(other.userId), cities, states });
  }
  if (overlaps.length === 0) return [];

  const users = await User.find({ _id: { $in: overlaps.map((o) => o.userId) } }).select("name").lean();
  const nameOf = new Map(users.map((u) => [String(u._id), u.name as string]));
  return overlaps.map((o) => ({
    superAgentName: nameOf.get(o.userId) ?? "Unknown",
    overlappingCities: o.cities,
    overlappingStates: o.states,
  }));
}

/**
 * Take back from a super agent's agents whatever now falls outside the super
 * agent's region. An agent city inside a state the super agent holds stays —
 * the earlier `$pull: { $nin: assignedCityIds }` removed it, and with an empty
 * city list it emptied every agent's cities.
 *
 * Returns how many agents lost something.
 */
export async function trimAgentsToRegion(saProfileId: IdLike, region: RegionIds): Promise<number> {
  const agents = await Agent.find({ superAgentId: saProfileId })
    .select("assignedCityIds assignedStateIds")
    .lean();
  if (agents.length === 0) return 0;

  const allowedCities = await expandStatesToCities({
    assignedCityIds: toObjectIds(region.cityIds),
    assignedStateIds: toObjectIds(region.stateIds),
  });
  const allowedStates = new Set(region.stateIds);

  const trims = agents.flatMap((agent) => {
    const cities = toIds(agent.assignedCityIds).filter((id) => !allowedCities.has(id));
    const states = toIds(agent.assignedStateIds).filter((id) => !allowedStates.has(id));
    if (cities.length === 0 && states.length === 0) return [];
    return [
      Agent.updateOne(
        { _id: agent._id },
        {
          $pull: {
            ...(cities.length ? { assignedCityIds: { $in: toObjectIds(cities) } } : {}),
            ...(states.length ? { assignedStateIds: { $in: toObjectIds(states) } } : {}),
          },
        },
      ),
    ];
  });
  await Promise.all(trims);
  return trims.length;
}

export interface SetRegionResult {
  profileId: string;
  conflicts: RegionConflict[];
  trimmedAgents: number;
}

/**
 * Replace a super agent's region. Warns about overlaps with other super agents
 * and, unless told not to, trims their agents to fit. Clearing a region (a
 * territory removed or moved to someone else) passes `trimAgents: false`: the
 * agents keep their cities until an admin draws the region again, rather than
 * losing all of them at once.
 */
export async function setSuperAgentRegion(
  saUserId: string,
  region: RegionIds,
  { trimAgents = true }: { trimAgents?: boolean } = {},
): Promise<SetRegionResult | null> {
  const conflicts = await findRegionOverlaps(saUserId, region);
  const profile = await SuperAgent.findOneAndUpdate(
    { userId: saUserId },
    { $set: { assignedCityIds: toObjectIds(region.cityIds), assignedStateIds: toObjectIds(region.stateIds) } },
    { returnDocument: "after" },
  )
    .select("_id")
    .lean();
  if (!profile) return null;

  const trimmedAgents = trimAgents ? await trimAgentsToRegion(profile._id, region) : 0;
  return { profileId: String(profile._id), conflicts, trimmedAgents };
}
