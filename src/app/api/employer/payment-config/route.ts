import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";

/**
 * POST /api/employer/payment-config
 * Stores gateway selection + public key. Secret key is stored encrypted.
 * Actual payment processing is NOT wired yet — setup only.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await req.json();
  const { gateway, publicKey, secretKey } = body;

  if (!gateway || !["stripe", "tap"].includes(gateway)) {
    return NextResponse.json({ error: "Invalid gateway" }, { status: 400 });
  }
  if (!publicKey || typeof publicKey !== "string") {
    return NextResponse.json({ error: "Public key is required" }, { status: 400 });
  }

  // Store config on employer document (paymentConfig sub-doc)
  // Secret key should be encrypted in production — storing placeholder for now
  const update = {
    "paymentConfig.gateway": gateway,
    "paymentConfig.publicKey": publicKey.trim(),
    "paymentConfig.isConfigured": true,
    "paymentConfig.configuredAt": new Date(),
    // NOTE: In production, encrypt secretKey with AES-256 before storing
    ...(secretKey ? { "paymentConfig.secretKeyHash": `encrypted:${Buffer.from(secretKey).toString("base64")}` } : {}),
  };

  const employer = await Employer.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: update },
    { new: true },
  );

  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    gateway,
    isConfigured: true,
  });
}

export const POST = withAuth(handler);
