/**
 * Seed script — create or reset admin user
 * Usage:  node scripts/create-admin.mjs
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

// ─── Admin credentials ────────────────────────────────────────────────────────
const ADMIN_EMAIL    = "admin@mployedin.com";
const ADMIN_PASSWORD = "Admin@1234";
const ADMIN_NAME     = "Super Admin";

// ─── Minimal User schema (mirrors src/models/User.ts) ─────────────────────────
const UserSchema = new mongoose.Schema(
  {
    name:                   { type: String, required: true },
    email:                  { type: String, required: true, unique: true, lowercase: true },
    passwordHash:           { type: String },
    role:                   { type: String, enum: ["admin","super_agent","agent","employer","job_seeker"] },
    locale:                 { type: String, default: "en" },
    isActive:               { type: Boolean, default: true },
    isEmailVerified:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      locale: "en",
      isActive: true,
      isEmailVerified: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("🎉 Admin user ready:");
  console.log("   Email   :", ADMIN_EMAIL);
  console.log("   Password:", ADMIN_PASSWORD);
  console.log("   Role    :", admin.role);
  console.log("   ID      :", admin._id.toString());
  console.log("\n👉 Login at http://localhost:3000/en/login");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
