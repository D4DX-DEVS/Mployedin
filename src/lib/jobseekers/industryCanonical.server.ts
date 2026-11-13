import Industry from "@/models/Industry";
import JobSeeker from "@/models/JobSeeker";
import { canonicalIndustryCounts, rawIndustryValuesFor, type IndustryCount } from "@/lib/jobseekers/industryCanonical";

/**
 * Server side of industryCanonical.ts: the master names and the spellings
 * stored on seekers, each read once per five minutes (a few hundred strings),
 * so the seeker lists can filter and count by master industry.
 */

const TTL_MS = 5 * 60_000;
let masterCache: { at: number; names: string[] } | null = null;
let storedCache: { at: number; values: string[] } | null = null;

export async function industryMasterNames(): Promise<string[]> {
  if (masterCache && Date.now() - masterCache.at < TTL_MS) return masterCache.names;
  const rows = await Industry.find({ isActive: true }).select("name").lean<{ name: string }[]>();
  masterCache = { at: Date.now(), names: rows.map((r) => r.name).filter(Boolean) };
  return masterCache.names;
}

async function storedIndustryValues(): Promise<string[]> {
  if (storedCache && Date.now() - storedCache.at < TTL_MS) return storedCache.values;
  const values = ((await JobSeeker.distinct("industry")) as unknown[]).filter((v): v is string => typeof v === "string" && v.trim() !== "");
  storedCache = { at: Date.now(), values };
  return values;
}

/** The `industry` condition for a chosen master industry: every stored spelling that means it. */
export async function industryFilterCondition(industry: string): Promise<{ industry: { $in: string[] } }> {
  const [names, stored] = await Promise.all([industryMasterNames(), storedIndustryValues()]);
  return { industry: { $in: rawIndustryValuesFor(industry, stored, names) } };
}

/** Raw `$group` rows from a scoped aggregate → counts per master industry. */
export async function foldIndustryCounts(
  rows: ReadonlyArray<{ industry: string | null | undefined; count: number }>,
): Promise<IndustryCount[]> {
  return canonicalIndustryCounts(rows, await industryMasterNames());
}
