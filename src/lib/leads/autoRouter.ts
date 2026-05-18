import Territory from "@/models/Territory";
import type { ILead } from "@/models/Lead";

export interface RouteResult {
  territoryId: string;
  superAgentId: string;
  territoryName: string;
}

export async function findTerritoryForLead(
  country?: string,
  city?: string
): Promise<RouteResult | null> {
  if (!country) return null;

  const normalizedCountry = country.trim().toLowerCase();

  const territories = await Territory.find({
    superAgentId: { $ne: null },
  })
    .select("name countries cityIds superAgentId")
    .lean();

  let bestMatch: (typeof territories)[number] | null = null;

  for (const territory of territories) {
    const countryMatch = territory.countries?.some(
      (c: string) => c.toLowerCase() === normalizedCountry
    );

    if (!countryMatch) continue;

    if (city && territory.cityIds?.length > 0) {
      bestMatch = territory;
      break;
    }

    if (!bestMatch) {
      bestMatch = territory;
    }
  }

  if (!bestMatch || !bestMatch.superAgentId) return null;

  return {
    territoryId: bestMatch._id.toString(),
    superAgentId: bestMatch.superAgentId.toString(),
    territoryName: bestMatch.name,
  };
}

export async function autoRouteLead(
  lead: Pick<ILead, "country" | "city" | "superAgentId">
): Promise<RouteResult | null> {
  if (lead.superAgentId) return null;

  return findTerritoryForLead(lead.country, lead.city);
}
