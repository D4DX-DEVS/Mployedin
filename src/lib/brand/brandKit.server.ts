import "server-only";
import { connectDB } from "@/lib/db/mongoose";
import { Employer, type IEmployerBrandKit } from "@/models/Employer";
import { SystemSettings } from "@/models/SystemSettings";
import { MPLOYEDIN_BRAND_KIT, resolveBrandKit, type BrandKit, type PosterContact } from "./brandKit";

/** Only the kit fields, never the subdocument's timestamps or anything Mongoose adds. */
function kitFields(stored?: IEmployerBrandKit | null): Partial<BrandKit> | null {
  if (!stored) return null;
  const { logoUrl, displayName, primary, accent, text, background, font, tone } = stored;
  return { logoUrl, displayName, primary, accent, text, background, font, tone };
}

/** The Mployedin kit as an admin left it (built-in default where unset). */
export async function getPlatformBrandKit(): Promise<BrandKit> {
  await connectDB();
  const settings = (await SystemSettings.findOne().select("brandKit").lean()) as { brandKit?: IEmployerBrandKit } | null;
  return resolveBrandKit(kitFields(settings?.brandKit), MPLOYEDIN_BRAND_KIT);
}

/**
 * Mployedin's contact line for posters. Email falls back to the platform
 * support address; the phone is printed only once an admin sets it.
 */
export async function getPosterContact(): Promise<PosterContact> {
  await connectDB();
  const settings = (await SystemSettings.findOne().select("posterContact supportEmail").lean()) as {
    posterContact?: { email?: string; phone?: string };
    supportEmail?: string;
  } | null;
  return {
    email: settings?.posterContact?.email || settings?.supportEmail || "support@mployedin.com",
    phone: settings?.posterContact?.phone || "",
  };
}

export interface EmployerBrandKitView {
  /** What posters use when the employer picks "our company". */
  kit: BrandKit;
  /** The Mployedin kit, for "Mployedin" posters and "reset to default". */
  platform: BrandKit;
  /** True once the employer has saved their own kit. */
  isCustom: boolean;
  /** The company logo from the profile, used when the kit has no logo of its own. */
  companyLogo: string | null;
  companyName: string;
  /** Mployedin's contact line, the same on every poster. */
  contact: PosterContact;
}

/**
 * An employer's poster brand. A kit with no logo of its own uses the company
 * logo from the profile; a company with neither falls back to the Mployedin logo.
 */
export async function getEmployerBrandKit(employerId: string): Promise<EmployerBrandKitView | null> {
  await connectDB();
  const [employer, platform, contact] = await Promise.all([
    Employer.findById(employerId).select("brandKit logo companyName").lean() as Promise<{
      brandKit?: IEmployerBrandKit;
      logo?: string;
      companyName?: string;
    } | null>,
    getPlatformBrandKit(),
    getPosterContact(),
  ]);
  if (!employer) return null;
  const stored = kitFields(employer.brandKit);
  const companyLogo = employer.logo || null;
  const base: BrandKit = { ...platform, logoUrl: companyLogo ?? platform.logoUrl };
  return {
    kit: resolveBrandKit(stored, base),
    platform,
    isCustom: Boolean(stored && Object.values(stored).some((v) => v !== undefined && v !== "")),
    companyLogo,
    companyName: employer.companyName ?? "",
    contact,
  };
}
