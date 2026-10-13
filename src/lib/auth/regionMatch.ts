/**
 * Territory matching without database access: the query fragments and their
 * per-record forms. Split from agentRestrictions so a route can use them while
 * tests stub the scope lookups there. agentRestrictions re-exports all of it.
 */
import type mongoose from "mongoose";

export interface RegionInfo {
  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
}

/**
 * Query fragment matching employers registered inside a territory. An
 * employer's region is the catalogue city picked at signup (`regionCityId`,
 * with its `regionStateId`), so a territory covers it by holding that city or
 * the whole state. Territories may overlap: every super-agent and agent whose
 * territory covers the region sees the employer. `null` for an empty territory.
 */
export function employerRegionMatch(region: RegionInfo): Record<string, unknown> | null {
  const or: Record<string, unknown>[] = [];
  if (region.assignedCityIds.length > 0) or.push({ regionCityId: { $in: region.assignedCityIds } });
  if (region.assignedStateIds.length > 0) or.push({ regionStateId: { $in: region.assignedStateIds } });
  return or.length > 0 ? { $or: or } : null;
}

/**
 * Query fragment matching job seekers whose area (the catalogue city they
 * picked, `regionCityId`/`regionStateId` like an employer's) lies inside a
 * territory. A seeker who hid their profile is never matched: the area makes
 * someone visible to the staff who cover it, it never overrides "hidden".
 * `null` for an empty territory.
 */
export function seekerRegionMatch(region: RegionInfo): Record<string, unknown> | null {
  const match = employerRegionMatch(region);
  return match ? { ...match, profileVisibility: { $ne: "hidden" } } : null;
}

/** The per-record form of `seekerRegionMatch`. */
export function seekerInRegion(
  seeker: { regionCityId?: unknown; regionStateId?: unknown; profileVisibility?: string | null },
  region: RegionInfo | null,
): boolean {
  if (!region || seeker.profileVisibility === "hidden") return false;
  return employerInRegion(seeker, region);
}

/** The per-record form of `employerRegionMatch`: registered in a city or state of `region`. */
export function employerInRegion(
  record: { regionCityId?: unknown; regionStateId?: unknown },
  region: RegionInfo | null,
): boolean {
  if (!region) return false;
  const has = (ids: mongoose.Types.ObjectId[], id: unknown) => id != null && ids.some((x) => String(x) === String(id));
  return has(region.assignedCityIds, record.regionCityId) || has(region.assignedStateIds, record.regionStateId);
}
