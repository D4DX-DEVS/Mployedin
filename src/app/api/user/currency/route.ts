import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import SystemSettings from "@/models/SystemSettings";
import { currencyForCountry } from "@/lib/currency";
import type { UserRole } from "@/types/user";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * GET /api/user/currency
 * Returns the user's currency code based on their role and country setting.
 * - Admin: system defaultCurrency
 * - Agent: agent currencyCode (from settings)
 * - Super-agent: super-agent currencyCode (from settings)
 * - Employer: derived from employer's country field
 * - Job seeker: derived from nationality/currentLocation
 * Falls back to system defaultCurrency, then "AED".
 */
async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  let currencyCode: string | null = null;

  switch (ctx.role) {
    case "agent": {
      const profile = await Agent.findOne({ userId: ctx.userId })
        .select("currencyCode country")
        .lean();
      currencyCode = profile?.currencyCode || null;
      if (!currencyCode && profile?.country) {
        currencyCode = currencyForCountry(profile.country).code;
      }
      break;
    }
    case "super_agent": {
      const profile = await SuperAgent.findOne({ userId: ctx.userId })
        .select("currencyCode country")
        .lean();
      currencyCode = profile?.currencyCode || null;
      if (!currencyCode && profile?.country) {
        currencyCode = currencyForCountry(profile.country).code;
      }
      break;
    }
    case "employer": {
      const profile = await Employer.findOne({ userId: ctx.userId })
        .select("country")
        .lean();
      if (profile?.country) {
        // country may be a full name or ISO code — try ISO first
        const code = profile.country.length === 2
          ? profile.country.toUpperCase()
          : null;
        if (code) {
          currencyCode = currencyForCountry(code).code;
        }
      }
      break;
    }
    case "job_seeker": {
      const profile = await JobSeeker.findOne({ userId: ctx.userId })
        .select("nationality currentLocation")
        .lean();
      // nationality is typically a country code or country name
      const countryField = profile?.nationality || profile?.currentLocation || "";
      if (countryField.length === 2) {
        currencyCode = currencyForCountry(countryField.toUpperCase()).code;
      }
      break;
    }
    // admin falls through to system default
  }

  // Fallback to system default currency
  if (!currencyCode) {
    const settings = await SystemSettings.findOne()
      .select("defaultCurrency")
      .lean();
    currencyCode = settings?.defaultCurrency || "AED";
  }

  return NextResponse.json({ currencyCode });
}

export const GET = withAuth(handler);
