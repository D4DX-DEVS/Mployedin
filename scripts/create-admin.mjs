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
const SEED_USERS = [
  { name: "Super Admin",   email: "admin@mployedin.com",      password: "Admin@1234",      role: "admin"      },
  { name: "Super Agent",   email: "superagent@mployedin.com", password: "SuperAgent@1234", role: "super_agent" },
  { name: "Agent",         email: "agent@mployedin.com",      password: "Agent@1234",      role: "agent"      },
  { name: "Employer",      email: "employer@mployedin.com",   password: "Employer@1234",   role: "employer"   },
  { name: "Job Seeker",    email: "jobseeker@mployedin.com",  password: "JobSeeker@1234",  role: "job_seeker" },
];

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
      const passwordHash = await bcrypt.hash(u.password, 12);
      await User.findOneAndUpdate(
        { email: u.email },
        { name: u.name, email: u.email, passwordHash, role: u.role, locale: "en", isActive: true, isEmailVerified: true },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      console.log(`✅  ${u.role.padEnd(12)}  ${u.email}  /  ${u.password}`);
    }
    console.log("\n👉 Login at /en/login");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
