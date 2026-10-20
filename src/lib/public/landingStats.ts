import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Placement from "@/models/Placement";
import Country from "@/models/Country";
import { countryKey } from "@/lib/i18n/locations";

export interface LandingCountry {
  /** Country master-data name, which the public jobs search matches. */
  name: string;
  nameAr: string;
  count: number;
}

export interface LandingStats {
  activeJobs: number;
  verifiedEmployers: number;
  countries: number;
  placementsThisMonth: number;
  remoteJobs: number;
  topCountries: LandingCountry[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const TOP_COUNTRIES = 8;

let cached: { at: number; value: LandingStats } | null = null;

/** Jobs a visitor can see on the public jobs page — keep in step with it. */
function publicJobFilter() {
  return {
    status: "active",
    visibility: { $nin: ["private", "invite_only"] },
    $and: [{ $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }],
  };
}

async function computeStats(): Promise<LandingStats> {
  await connectDB();
  const filter = publicJobFilter();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [activeJobs, remoteJobs, byCountry, employerIds, placementsThisMonth, masterCountries] = await Promise.all([
    Job.countDocuments(filter),
    Job.countDocuments({ ...filter, "location.isRemote": true }),
    Job.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: "$location.country", count: { $sum: 1 } } },
    ]),
    Job.distinct("employerId", filter),
    Placement.countDocuments({ status: { $in: ["active", "completed"] }, createdAt: { $gte: monthStart } }),
    Country.find({ isActive: true }).select("name nameAr code").lean(),
  ]);

  // Jobs file their country as "IN" as often as "India", and some rows hold a
  // state or city ("Kerala"). Only countries in the master list are shown, merged
  // on the shared key and named as the master list names them.
  const master = new Map<string, { name: string; nameAr: string }>();
  for (const country of masterCountries) {
    const entry = { name: country.name, nameAr: country.nameAr ?? "" };
    for (const spelling of [country.name, country.code]) {
      const key = countryKey(spelling);
      if (key) master.set(key, entry);
    }
  }
  const merged = new Map<string, LandingCountry>();
  for (const row of byCountry) {
    const key = countryKey(row._id);
    const country = key ? master.get(key) : undefined;
    if (!country) continue;
    const entry = merged.get(key) ?? { name: country.name, nameAr: country.nameAr, count: 0 };
    entry.count += row.count;
    merged.set(key, entry);
  }

  const verifiedEmployers = employerIds.length === 0 ? 0 : await Employer.countDocuments({
    _id: { $in: employerIds },
    $or: [{ domainVerified: true }, { isAgentVerified: true }, { verificationLevel: { $in: ["company", "premium"] } }],
  });

  return {
    activeJobs,
    verifiedEmployers,
    countries: merged.size,
    placementsThisMonth,
    remoteJobs,
    topCountries: [...merged.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_COUNTRIES)
      .map(({ name, nameAr, count }) => ({ name, nameAr, count })),
  };
}

/** Public landing numbers, recomputed at most every ten minutes per instance. */
export async function getLandingStats(): Promise<LandingStats> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const value = await computeStats();
  cached = { at: Date.now(), value };
  return value;
}
