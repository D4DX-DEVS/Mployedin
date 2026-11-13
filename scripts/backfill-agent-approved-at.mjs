/**
 * One-time migration for lib/auth/agentApproval.ts.
 *
 * An agent may only be switched on once their email is confirmed, unless staff
 * created or approved them before (`User.agentApprovedAt`). Agents active
 * today were all created or approved by staff (a self-registered agent is
 * inactive until approved), but carry no stamp yet: without one, an agent
 * created by staff with an unconfirmed address could not be switched back on
 * after being switched off.
 *
 * Stamps every ACTIVE agent that has none. Inactive agents are left alone:
 * they may be self-registrations still waiting for approval.
 *
 * Usage:
 *   node scripts/backfill-agent-approved-at.mjs           # dry run: counts only
 *   node scripts/backfill-agent-approved-at.mjs --apply   # writes
 *
 * Requires MONGODB_URI (from .env or the shell).
 */

import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const filter = { role: "agent", isActive: true, agentApprovedAt: { $exists: false } };

await mongoose.connect(MONGODB_URI);
const users = mongoose.connection.db.collection("users");

try {
  const toStamp = await users.countDocuments(filter);
  const unconfirmed = await users.countDocuments({ ...filter, isEmailVerified: { $ne: true } });
  const pending = await users.countDocuments({ role: "agent", isActive: { $ne: true }, agentApprovedAt: { $exists: false } });
  console.log(`Active agents without a stamp: ${toStamp} (of which unconfirmed email: ${unconfirmed})`);
  console.log(`Inactive agents left alone (may be awaiting approval): ${pending}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to stamp them.");
  } else {
    // Each active agent was approved by being created or switched on; the
    // account's creation time is the best record of when that happened.
    const result = await users.updateMany(filter, [
      { $set: { agentApprovedAt: { $ifNull: ["$createdAt", "$$NOW"] } } },
    ]);
    console.log(`Stamped ${result.modifiedCount} agent(s).`);
  }
} finally {
  await mongoose.disconnect();
}
