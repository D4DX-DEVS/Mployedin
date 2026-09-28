import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import City from "@/models/City";
import State from "@/models/State";
import Country from "@/models/Country";
import Territory from "@/models/Territory";
import { countryKey } from "@/lib/i18n/locations";
import { escapeRegex } from "@/lib/security/sanitize";
import type { ILead } from "@/models/Lead";

export interface RouteResult {
  /** SuperAgent profile id — what `Lead.superAgentId` references. */
  superAgentId: string;
  /** The super agent's named territory, when an admin named one. */
  territoryId: string | null;
  territoryName: string | null;
}

interface CandidateSA {
  _id: unknown;
  userId: unknown;
  assignedCityIds?: unknown[];
  assignedStateIds?: unknown[];
}

const ids = (list: unknown[] | undefined) => (list ?? []).map(String);

/** A free-text country ("India", "IN", "india ") to its master-data id. */
async function resolveCountryId(country: string): Promise<string | null> {
  const key = countryKey(country);
  if (key.length === 2) {
    const byCode = await Country.findOne({ code: key.toUpperCase() }).select("_id").lean();
    if (byCode) return String(byCode._id);
  }
  const byName = await Country.findOne({ name: new RegExp(`^\\s*${escapeRegex(country.trim())}\\s*$`, "i") })
    .select("_id")
    .lean();
  return byName ? String(byName._id) : null;
}

/** Live super agents that hold any region, as candidates. */
async function superAgentsWithRegions(): Promise<CandidateSA[]> {
  const profiles = await SuperAgent.find({
    roleArchivedAt: null,
    $or: [{ "assignedCityIds.0": { $exists: true } }, { "assignedStateIds.0": { $exists: true } }],
  })
    .select("_id userId assignedCityIds assignedStateIds")
    .lean<CandidateSA[]>();
  if (profiles.length === 0) return [];
  const active = await User.find({ _id: { $in: profiles.map((p) => p.userId) }, role: "super_agent", isActive: true })
    .select("_id")
    .lean();
  const activeIds = new Set(active.map((u) => String(u._id)));
  return profiles.filter((p) => activeIds.has(String(p.userId)));
}

/**
 * Which super agent covers a lead's location — read from the same regions that
 * scope every super-agent screen (SuperAgent.assignedCityIds / assignedStateIds),
 * so a lead routes to the super agent who will actually see it.
 *
 * - With a city: a super agent holding that city wins over one holding its state.
 * - With only a country: the super agent whose region sits in that country.
 * - Two or more equally good matches route nowhere; the lead stays with the
 *   creating agent's own super agent, who already sees it through the agent.
 */
export async function findTerritoryForLead(country?: string, city?: string): Promise<RouteResult | null> {
  const countryText = country?.trim();
  const cityText = city?.trim();
  if (!countryText && !cityText) return null;

  const countryId = countryText ? await resolveCountryId(countryText) : null;
  const countryStateIds = countryId
    ? ids((await State.find({ countryId }).select("_id").lean()).map((s) => s._id))
    : null;

  const candidates = await superAgentsWithRegions();
  if (candidates.length === 0) return null;

  let matches: CandidateSA[] = [];

  if (cityText) {
    const cities = await City.find({
      name: new RegExp(`^\\s*${escapeRegex(cityText)}\\s*$`, "i"),
      ...(countryStateIds ? { stateId: { $in: countryStateIds } } : {}),
    })
      .select("_id stateId")
      .lean();
    const cityIds = new Set(ids(cities.map((c) => c._id)));
    const stateIds = new Set(ids(cities.map((c) => c.stateId)));
    matches = candidates.filter((sa) => ids(sa.assignedCityIds).some((id) => cityIds.has(id)));
    if (matches.length === 0) {
      matches = candidates.filter((sa) => ids(sa.assignedStateIds).some((id) => stateIds.has(id)));
    }
  }

  if (matches.length === 0 && countryStateIds) {
    const inCountry = new Set(countryStateIds);
    const saCityIds = candidates.flatMap((sa) => ids(sa.assignedCityIds));
    const cityStates = saCityIds.length
      ? await City.find({ _id: { $in: saCityIds } }).select("stateId").lean()
      : [];
    const stateOfCity = new Map(cityStates.map((c) => [String(c._id), String(c.stateId ?? "")]));
    matches = candidates.filter(
      (sa) =>
        ids(sa.assignedStateIds).some((id) => inCountry.has(id)) ||
        ids(sa.assignedCityIds).some((id) => inCountry.has(stateOfCity.get(id) ?? "")),
    );
  }

  if (matches.length !== 1) return null;
  const [sa] = matches;
  const territory = await Territory.findOne({ superAgentId: sa.userId }).select("_id name").lean();
  return {
    superAgentId: String(sa._id),
    territoryId: territory ? String(territory._id) : null,
    territoryName: territory ? territory.name : null,
  };
}

export async function autoRouteLead(
  lead: Pick<ILead, "country" | "city" | "superAgentId">
): Promise<RouteResult | null> {
  if (lead.superAgentId) return null;

  return findTerritoryForLead(lead.country, lead.city);
}
