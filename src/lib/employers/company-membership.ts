import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import type { CompanyRole, ICompanyUserPermissions } from "@/models/CompanyUser";
import { User } from "@/models/User";

export interface CompanyMemberSnapshot {
  _id?: unknown;
  companyId: unknown;
  userId?: unknown;
  email: string;
  companyRole: CompanyRole;
  companyRoles?: CompanyRole[];
  permissions?: ICompanyUserPermissions;
  status?: string;
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

async function resolveUserEmail(userId: unknown, email?: string | null): Promise<string | null> {
  const normalized = email?.toLowerCase().trim();
  if (normalized) return normalized;

  const user = await User.findById(userId).select("email").lean();
  return user?.email ? String(user.email).toLowerCase().trim() : null;
}

export async function ensureEmployerOwnerMembership({
  companyId,
  userId,
  email,
}: {
  companyId: unknown;
  userId: unknown;
  email?: string | null;
}): Promise<CompanyMemberSnapshot | null> {
  const existing = await CompanyUser.findOne({ companyId, userId, status: "active" }).lean();
  if (existing) return existing as CompanyMemberSnapshot;

  const resolvedEmail = await resolveUserEmail(userId, email);
  if (!resolvedEmail) return null;

  const ownerPermissions = getDefaultPermissions("owner");
  const existingByEmail = await CompanyUser.findOne({ companyId, email: resolvedEmail });
  if (existingByEmail) {
    existingByEmail.userId = userId as typeof existingByEmail.userId;
    existingByEmail.companyRole = "owner";
    existingByEmail.companyRoles = ["owner"];
    existingByEmail.permissions = ownerPermissions;
    existingByEmail.status = "active";
    existingByEmail.acceptedAt = existingByEmail.acceptedAt ?? new Date();
    await existingByEmail.save();
    return existingByEmail.toObject() as CompanyMemberSnapshot;
  }

  try {
    const created = await CompanyUser.create({
      companyId,
      userId,
      email: resolvedEmail,
      companyRole: "owner",
      companyRoles: ["owner"],
      permissions: ownerPermissions,
      invitedBy: userId,
      invitedAt: new Date(),
      acceptedAt: new Date(),
      status: "active",
    });
    return created.toObject() as CompanyMemberSnapshot;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await CompanyUser.findOne({ companyId, userId, status: "active" }).lean();
    return raced as CompanyMemberSnapshot | null;
  }
}