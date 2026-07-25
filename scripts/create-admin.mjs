/**
 * Seed script — create or reset admin user
 *
 * Usage (dev — .env in project root):
 *   node --env-file=.env scripts/create-admin.mjs
 *
 * Usage (production — pass URI directly):
 *   MONGODB_URI="mongodb+srv://..." node scripts/create-admin.mjs
 *
 * The script REQUIRES MONGODB_URI to be set — it will not fall back
 * to any hardcoded connection string.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "❌  MONGODB_URI is not set.\n" +
    "    Dev:  node --env-file=.env scripts/create-admin.mjs\n" +
    "    Prod: MONGODB_URI='...' node scripts/create-admin.mjs"
  );
  process.exit(1);
}

// ─── Test / seed users ────────────────────────────────────────────────────────
// Passwords must be supplied by the operator. Never add defaults here: this
// script updates existing accounts as well as creating them.
const SEED_USERS = [
  { name: "Super Admin", email: "admin@mployedin.com", passwordEnv: "SEED_ADMIN_PASSWORD", role: "admin" },
  { name: "Super Agent", email: "superagent@mployedin.com", passwordEnv: "SEED_SUPER_AGENT_PASSWORD", role: "super_agent" },
  { name: "Agent", email: "agent@mployedin.com", passwordEnv: "SEED_AGENT_PASSWORD", role: "agent" },
  { name: "Employer", email: "employer@mployedin.com", passwordEnv: "SEED_EMPLOYER_PASSWORD", role: "employer" },
  { name: "Job Seeker", email: "jobseeker@mployedin.com", passwordEnv: "SEED_JOB_SEEKER_PASSWORD", role: "job_seeker" },
];

const passwordErrors = SEED_USERS.flatMap((user) => {
  const password = process.env[user.passwordEnv];
  if (!password) return [`${user.passwordEnv} is required`];
  if (password.length < 16) return [`${user.passwordEnv} must contain at least 16 characters`];
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return [`${user.passwordEnv} must contain upper-case, lower-case, numeric, and special characters`];
  }
  return [];
});

if (!process.argv.includes("--delete") && passwordErrors.length > 0) {
  console.error(`❌ Invalid seed configuration:\n${passwordErrors.map((message) => `    - ${message}`).join("\n")}`);
  process.exit(1);
}

// ─── Minimal User schema (mirrors src/models/User.ts) ─────────────────────────
const UserSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true },
    email:           { type: String, required: true, unique: true, lowercase: true },
    passwordHash:    { type: String },
    role:            { type: String, enum: ["admin","super_agent","agent","employer","job_seeker"] },
    locale:          { type: String, default: "en" },
    isActive:        { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: true },
    passwordChangedAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const isDelete = process.argv.includes("--delete");

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const emails = SEED_USERS.map((u) => u.email);

  if (isDelete) {
    const result = await User.deleteMany({ email: { $in: emails } });
    console.log(`🗑️  Deleted ${result.deletedCount} test user(s).`);
  } else {
    for (const u of SEED_USERS) {
      const passwordHash = await bcrypt.hash(process.env[u.passwordEnv], 12);
      await User.findOneAndUpdate(
        { email: u.email },
        {
          name: u.name,
          email: u.email,
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockUntil: null,
          role: u.role,
          locale: "en",
          isActive: true,
          isEmailVerified: true,
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      console.log(`✅  ${u.role.padEnd(12)}  ${u.email}`);
    }
    console.log("\n👉 Login at /en/login");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
