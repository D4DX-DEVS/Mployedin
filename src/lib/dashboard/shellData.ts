import connectDB from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { Employer } from "@/models/Employer";
import SystemSettings from "@/models/SystemSettings";
import User, { type UserRole } from "@/models/User";

interface DashboardShellData {
  lastLogin?: string;
  companyLogo?: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SHELL_DATA_TTL_MS = 60_000;
const MAINTENANCE_MODE_TTL_MS = 30_000;
const MAINTENANCE_MODE_FALLBACK_TTL_MS = 5_000;
const MAX_SHELL_CACHE_ENTRIES = 200;

const shellDataCache = new Map<string, CacheEntry<DashboardShellData>>();

let maintenanceModeCache: CacheEntry<boolean> | null = null;

function readShellDataCache(key: string): DashboardShellData | undefined {
  const entry = shellDataCache.get(key);

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    shellDataCache.delete(key);
    return undefined;
  }

  return entry.value;
}

function writeShellDataCache(key: string, value: DashboardShellData): void {
  if (shellDataCache.has(key)) {
    shellDataCache.delete(key);
  }

  shellDataCache.set(key, {
    value,
    expiresAt: Date.now() + SHELL_DATA_TTL_MS,
  });

  if (shellDataCache.size > MAX_SHELL_CACHE_ENTRIES) {
    const oldestKey = shellDataCache.keys().next().value;
    if (oldestKey) {
      shellDataCache.delete(oldestKey);
    }
  }
}

export async function getCachedDashboardShellData(
  userId: string,
  role: UserRole
): Promise<DashboardShellData> {
  const cacheKey = `${role}:${userId}`;
  const cachedValue = readShellDataCache(cacheKey);
  if (cachedValue) {
    return cachedValue;
  }

  await connectDB();

  const [dbUser, dbEmployer] = await Promise.all([
    User.findById(userId).select("lastLogin").lean(),
    role === "employer"
      ? Employer.findOne({ userId }).select("logo").lean()
      : Promise.resolve(null),
  ]);

  const value = {
    lastLogin: dbUser?.lastLogin ? (dbUser.lastLogin as Date).toISOString() : undefined,
    companyLogo: (dbEmployer as { logo?: string } | null)?.logo ?? undefined,
  };

  writeShellDataCache(cacheKey, value);

  return value;
}

export async function getDashboardMaintenanceMode(): Promise<boolean> {
  if (maintenanceModeCache && maintenanceModeCache.expiresAt > Date.now()) {
    return maintenanceModeCache.value;
  }
  try {
    await connectDB();
    const settings = await SystemSettings.findOne().select("maintenanceMode").lean();
    const value = Boolean(settings?.maintenanceMode);
    maintenanceModeCache = { value, expiresAt: Date.now() + MAINTENANCE_MODE_TTL_MS };
    return value;
  } catch (error: unknown) {
    // ponytail: DB unreachable => fail open (dashboard stays usable) and reuse
    // the last known value. Short backoff so a dead replica set isn't hammered
    // on every request. Fail *closed* instead if maintenance mode ever gates
    // something security-sensitive.
    const value = maintenanceModeCache?.value ?? false;
    maintenanceModeCache = { value, expiresAt: Date.now() + MAINTENANCE_MODE_FALLBACK_TTL_MS };
    logger.error({ err: error }, "getDashboardMaintenanceMode: DB unavailable, using fallback");
    return value;
  }
}

export function clearDashboardShellCache(): void {
  shellDataCache.clear();
  maintenanceModeCache = null;
}