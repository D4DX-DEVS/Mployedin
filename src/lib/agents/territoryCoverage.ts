import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import City from "@/models/City";
import State from "@/models/State";
import Country from "@/models/Country";
import SuperAgent from "@/models/SuperAgent";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { escapeRegex, isValidObjectId } from "@/lib/security/sanitize";

/**
 * Where an employer sits, and who covers it.
 *
 * An employer's region is one catalogue city (and its state). A super-agent or
 * agent covers the employer when their territory holds that city or its whole
 * state. Territories may overlap on purpose — several super-agents can share a
 * region and all of them see the same employers — so these helpers always
 * return every match, never "the" owner.
 */

export interface EmployerRegion {
  cityId: mongoose.Types.ObjectId;
  stateId: mongoose.Types.ObjectId;
  cityName: string;
  /** ISO 3166-1 alpha-2 of the city's country. */
  countryCode: string;
}

interface CityDoc { _id: mongoose.Types.ObjectId; name: string; stateId: mongoose.Types.ObjectId }
interface StateDoc { _id: mongoose.Types.ObjectId; countryId: mongoose.Types.ObjectId }
interface CountryDoc { _id: mongoose.Types.ObjectId; code?: string }

async function toRegion(city: CityDoc | null): Promise<EmployerRegion | null> {
  if (!city) return null;
  const state = await State.findById(city.stateId).select("_id countryId").lean<StateDoc | null>();
  if (!state) return null;
  const country = await Country.findById(state.countryId).select("_id code").lean<CountryDoc | null>();
  return {
    cityId: city._id,
    stateId: state._id,
    cityName: city.name,
    countryCode: (country?.code ?? "").toUpperCase(),
  };
}

/**
 * Resolve the region an employer registered in.
 *
 * `cityId` (the signup picker) wins. Without it, a typed `cityName` resolves
 * only when exactly one active city of that name exists in `countryCode` —
 * an ambiguous or unknown name leaves the employer with no region rather than
 * guessing one.
 */
export async function resolveEmployerRegion(input: {
  cityId?: string | null;
  cityName?: string | null;
  countryCode?: string | null;
}): Promise<EmployerRegion | null> {
  await connectDB();

  if (input.cityId && isValidObjectId(input.cityId)) {
    const city = await City.findOne({ _id: input.cityId, isActive: true })
      .select("_id name stateId")
      .lean<CityDoc | null>();
    return toRegion(city);
  }

  const name = input.cityName?.trim();
  const code = input.countryCode?.trim().toUpperCase();
  if (!name || !code) return null;

  const country = await Country.findOne({ code }).select("_id").lean<CountryDoc | null>();
  if (!country) return null;
  const stateIds = (await State.find({ countryId: country._id }).select("_id").lean<StateDoc[]>())
    .map((s) => s._id);
  const matches = await City.find({
    stateId: { $in: stateIds },
    isActive: true,
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  })
    .select("_id name stateId")
    .limit(2)
    .lean<CityDoc[]>();
  return matches.length === 1 ? toRegion(matches[0]) : null;
}

/**
 * A job seeker's area: a catalogue city, or — when their town isn't listed —
 * just the region (state) it lies in (owner, 2026-10-02). A region-only area
 * has no city, so only staff who hold the whole region match it.
 */
export interface SeekerAreaRegion {
  cityId: mongoose.Types.ObjectId | null;
  cityName: string | null;
  stateId: mongoose.Types.ObjectId;
  stateName: string;
  /** ISO 3166-1 alpha-2 of the region's country. */
  countryCode: string;
}

/** Resolve a picked city (wins) or region; null for anything not active in the catalogue. */
export async function resolveSeekerArea(input: {
  cityId?: string | null;
  stateId?: string | null;
}): Promise<SeekerAreaRegion | null> {
  await connectDB();
  let city: CityDoc | null = null;
  let stateId = input.stateId;
  if (input.cityId) {
    if (!isValidObjectId(input.cityId)) return null;
    city = await City.findOne({ _id: input.cityId, isActive: true }).select("_id name stateId").lean<CityDoc | null>();
    if (!city) return null;
    stateId = String(city.stateId);
  }
  if (!stateId || !isValidObjectId(stateId)) return null;
  // An active city counts whatever its state's flag; a region picked alone must be active.
  const state = await State.findOne(city ? { _id: stateId } : { _id: stateId, isActive: true })
    .select("_id name countryId")
    .lean<(StateDoc & { name: string }) | null>();
  if (!state) return null;
  const country = await Country.findById(state.countryId).select("_id code").lean<CountryDoc | null>();
  return {
    cityId: city?._id ?? null,
    cityName: city?.name ?? null,
    stateId: state._id,
    stateName: state.name,
    countryCode: (country?.code ?? "").toUpperCase(),
  };
}

/**
 * Every active city inside a territory (its own cities plus the cities of its
 * whole states), named with their state — for pickers that must stay inside
 * the territory. Capped; a territory larger than `limit` is truncated.
 */
export async function listTerritoryCities(
  region: { assignedCityIds: mongoose.Types.ObjectId[]; assignedStateIds: mongoose.Types.ObjectId[] },
  limit = 2000,
): Promise<Array<{ _id: string; name: string; stateName: string }>> {
  await connectDB();
  const or: Record<string, unknown>[] = [];
  if (region.assignedCityIds.length > 0) or.push({ _id: { $in: region.assignedCityIds } });
  if (region.assignedStateIds.length > 0) or.push({ stateId: { $in: region.assignedStateIds } });
  if (or.length === 0) return [];
  const cities = await City.find({ $or: or, isActive: true })
    .select("_id name stateId")
    .sort({ name: 1 })
    .limit(limit)
    .lean<CityDoc[]>();
  const states = await State.find({ _id: { $in: [...new Set(cities.map((c) => String(c.stateId)))] } })
    .select("_id name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  const stateName = new Map(states.map((s) => [String(s._id), s.name]));
  return cities.map((c) => ({ _id: String(c._id), name: c.name, stateName: stateName.get(String(c.stateId)) ?? "" }));
}

/** Is this city inside the territory (listed itself, or in a state held whole)? */
export async function territoryHoldsCity(
  region: { assignedCityIds: mongoose.Types.ObjectId[]; assignedStateIds: mongoose.Types.ObjectId[] },
  cityId: string,
): Promise<boolean> {
  if (!isValidObjectId(cityId)) return false;
  if (region.assignedCityIds.some((c) => String(c) === cityId)) return true;
  if (region.assignedStateIds.length === 0) return false;
  const city = await City.findById(cityId).select("stateId").lean<{ stateId?: mongoose.Types.ObjectId } | null>();
  return Boolean(city?.stateId && region.assignedStateIds.some((s) => String(s) === String(city.stateId)));
}

type Ids = mongoose.Types.ObjectId[];

interface SuperAgentTerritory {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  cityIds: Set<string>;
  stateIds: Set<string>;
}

/**
 * Every live super-agent's territory as their book reads it
 * (`getSuperAgentBook`): their own cities and states plus those of the live
 * agents on their team (`agentIds`). "Who covers this employer" must use the
 * same territory as "what does this SA see", or the admin view drifts from it.
 */
async function loadSuperAgentTerritories(): Promise<SuperAgentTerritory[]> {
  const sas = await SuperAgent.find({ roleArchivedAt: null })
    .select("_id userId agentIds assignedCityIds assignedStateIds")
    .lean<Array<{ _id: mongoose.Types.ObjectId; userId: mongoose.Types.ObjectId; agentIds?: Ids; assignedCityIds?: Ids; assignedStateIds?: Ids }>>();
  const teamIds = sas.flatMap((sa) => sa.agentIds ?? []);
  const agents = teamIds.length > 0
    ? await Agent.find({ _id: { $in: teamIds }, roleArchivedAt: null })
      .select("_id assignedCityIds assignedStateIds")
      .lean<Array<{ _id: mongoose.Types.ObjectId; assignedCityIds?: Ids; assignedStateIds?: Ids }>>()
    : [];
  const agentById = new Map(agents.map((a) => [String(a._id), a]));
  return sas.map((sa) => {
    const team = (sa.agentIds ?? [])
      .map((id) => agentById.get(String(id)))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    return {
      _id: sa._id,
      userId: sa.userId,
      cityIds: new Set([...(sa.assignedCityIds ?? []), ...team.flatMap((a) => a.assignedCityIds ?? [])].map(String)),
      stateIds: new Set([...(sa.assignedStateIds ?? []), ...team.flatMap((a) => a.assignedStateIds ?? [])].map(String)),
    };
  });
}

export interface EmployerRegionSummary {
  cityId: string;
  cityName: string;
  stateName: string;
  countryCode: string;
  /** Live super-agents whose territory covers the region — all of them see the employer. */
  superAgents: Array<{ userId: string; name: string }>;
}

/**
 * Name each employer's region and the super-agents covering it, in one batch
 * (admin employer list, region dialog). Employers with no region are absent
 * from the map.
 */
export async function summariseEmployerRegions(
  employers: Array<{ _id: unknown; regionCityId?: unknown; regionStateId?: unknown }>,
): Promise<Map<string, EmployerRegionSummary>> {
  await connectDB();
  const withRegion = employers.filter((e) => e.regionCityId);
  const out = new Map<string, EmployerRegionSummary>();
  if (withRegion.length === 0) return out;

  const cityIds = [...new Set(withRegion.map((e) => String(e.regionCityId)))];
  const cities = await City.find({ _id: { $in: cityIds } }).select("_id name stateId").lean<CityDoc[]>();
  const stateIds = [...new Set(cities.map((c) => String(c.stateId)))];
  const [states, territories] = await Promise.all([
    State.find({ _id: { $in: stateIds } }).select("_id name countryId").lean<Array<StateDoc & { name: string }>>(),
    loadSuperAgentTerritories(),
  ]);
  const sas = territories.filter((t) =>
    cityIds.some((c) => t.cityIds.has(c)) || stateIds.some((s) => t.stateIds.has(s)));
  const countries = await Country.find({ _id: { $in: states.map((s) => s.countryId) } })
    .select("_id code")
    .lean<CountryDoc[]>();
  const users = await User.find({ _id: { $in: sas.map((s) => s.userId) }, isActive: { $ne: false } })
    .select("_id name email")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string }>>();

  const cityById = new Map(cities.map((c) => [String(c._id), c]));
  const stateById = new Map(states.map((s) => [String(s._id), s]));
  const codeById = new Map(countries.map((c) => [String(c._id), (c.code ?? "").toUpperCase()]));
  const userById = new Map(users.map((u) => [String(u._id), u]));

  for (const e of withRegion) {
    const city = cityById.get(String(e.regionCityId));
    if (!city) continue;
    const state = stateById.get(String(city.stateId));
    const covering = sas
      .filter((sa) => sa.cityIds.has(String(city._id)) || sa.stateIds.has(String(city.stateId)))
      .map((sa) => userById.get(String(sa.userId)))
      .filter((u): u is NonNullable<typeof u> => Boolean(u))
      .map((u) => ({ userId: String(u._id), name: u.name || u.email || "" }));
    out.set(String(e._id), {
      cityId: String(city._id),
      cityName: city.name,
      stateName: state?.name ?? "",
      countryCode: state ? codeById.get(String(state.countryId)) ?? "" : "",
      superAgents: covering,
    });
  }
  return out;
}

/**
 * Filter for employers no live super-agent sees through the territory: no
 * region at all, or a region outside every territory. `covered` inverts it.
 */
export async function employerCoverageFilter(covered: boolean): Promise<Record<string, unknown>> {
  await connectDB();
  const territories = await loadSuperAgentTerritories();
  const toIds = (sets: Set<string>[]) =>
    [...new Set(sets.flatMap((s) => [...s]))].map((id) => new mongoose.Types.ObjectId(id));
  const cityIds = toIds(territories.map((t) => t.cityIds));
  const stateIds = toIds(territories.map((t) => t.stateIds));
  const inTerritory = [{ regionCityId: { $in: cityIds } }, { regionStateId: { $in: stateIds } }];
  return covered ? { $or: inTerritory } : { $nor: inTerritory };
}

export interface CoveringMember {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  /** Whether the territory holds the city itself or its whole state. */
  via: "city" | "state";
}

export interface RegionCoverage {
  superAgents: CoveringMember[];
  agents: CoveringMember[];
}

interface TerritoryDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  assignedCityIds?: unknown[];
}

async function describe(docs: TerritoryDoc[], cityId: string): Promise<CoveringMember[]> {
  if (docs.length === 0) return [];
  const users = await User.find({ _id: { $in: docs.map((d) => d.userId) }, isActive: { $ne: false } })
    .select("_id name email")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string }>>();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return docs
    .filter((d) => byId.has(String(d.userId)))
    .map((d) => {
      const u = byId.get(String(d.userId))!;
      return {
        profileId: String(d._id),
        userId: String(d.userId),
        name: u.name ?? "",
        email: u.email ?? "",
        via: (d.assignedCityIds ?? []).some((c) => String(c) === cityId) ? "city" : "state",
      };
    });
}

/**
 * Every live super-agent and agent whose territory covers this city/state. A
 * super-agent's territory includes their team's regions (see
 * `loadSuperAgentTerritories`).
 */
export async function findRegionCoverage(region: {
  cityId: mongoose.Types.ObjectId | string;
  stateId: mongoose.Types.ObjectId | string;
}): Promise<RegionCoverage> {
  await connectDB();
  const cityId = String(region.cityId);
  const stateId = String(region.stateId);
  const [territories, agents] = await Promise.all([
    loadSuperAgentTerritories(),
    Agent.find({
      $or: [{ assignedCityIds: region.cityId }, { assignedStateIds: region.stateId }],
      roleArchivedAt: null,
    }).select("_id userId assignedCityIds").lean<TerritoryDoc[]>(),
  ]);
  const sas: TerritoryDoc[] = territories
    .filter((t) => t.cityIds.has(cityId) || t.stateIds.has(stateId))
    .map((t) => ({ _id: t._id, userId: t.userId, assignedCityIds: [...t.cityIds] }));
  const [superAgents, agentMembers] = await Promise.all([describe(sas, cityId), describe(agents, cityId)]);
  return { superAgents, agents: agentMembers };
}

/**
 * Other super-agents (or agents) whose territory overlaps a proposed one.
 *
 * Overlap is allowed — the admin is only told about it. Two territories overlap
 * when they share a city or a state, or when one holds a city inside a state
 * the other holds whole.
 */
export async function findTerritoryOverlaps(input: {
  role: "super_agent" | "agent";
  cityIds: string[];
  stateIds: string[];
  /** The profile being edited, left out of its own overlaps. */
  excludeUserId?: string | null;
}): Promise<CoveringMember[]> {
  await connectDB();
  const cityIds = input.cityIds.filter(isValidObjectId);
  const stateIds = input.stateIds.filter(isValidObjectId);
  if (cityIds.length === 0 && stateIds.length === 0) return [];

  // States the proposed cities sit in, and cities inside the proposed states.
  const [parentStateIds, childCityIds] = await Promise.all([
    cityIds.length > 0
      ? City.find({ _id: { $in: cityIds } }).distinct("stateId")
      : Promise.resolve([] as unknown[]),
    stateIds.length > 0
      ? City.find({ stateId: { $in: stateIds } }).distinct("_id")
      : Promise.resolve([] as unknown[]),
  ]);

  const or: Record<string, unknown>[] = [];
  if (cityIds.length > 0) or.push({ assignedCityIds: { $in: cityIds } });
  if (stateIds.length > 0) or.push({ assignedStateIds: { $in: stateIds } });
  if (parentStateIds.length > 0) or.push({ assignedStateIds: { $in: parentStateIds } });
  if (childCityIds.length > 0) or.push({ assignedCityIds: { $in: childCityIds } });

  const filter: Record<string, unknown> = { $or: or, roleArchivedAt: null };
  if (input.excludeUserId && isValidObjectId(input.excludeUserId)) {
    filter.userId = { $ne: new mongoose.Types.ObjectId(input.excludeUserId) };
  }
  const Model = input.role === "super_agent" ? SuperAgent : Agent;
  const docs = await (Model as typeof SuperAgent)
    .find(filter)
    .select("_id userId assignedCityIds assignedStateIds")
    .lean<Array<TerritoryDoc & { assignedStateIds?: mongoose.Types.ObjectId[] }>>();

  // `via`: "state" when the other holds a whole state this region touches
  // (a proposed state, or the state of a proposed city); otherwise "city" —
  // they hold a city inside this region.
  const touchedStates = new Set([...stateIds, ...parentStateIds.map(String)]);
  const members = await describe(docs, "");
  return members.map((m) => {
    const doc = docs.find((d) => String(d._id) === m.profileId);
    const stateOverlap = (doc?.assignedStateIds ?? []).some((s) => touchedStates.has(String(s)));
    return { ...m, via: stateOverlap ? "state" : "city" };
  });
}
