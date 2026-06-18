/**
 * Seed a fresh, fully-ready job seeker for manual/QA testing.
 *
 *   node --env-file=.env scripts/seed-test-jobseeker.mjs
 *
 * Creates (or resets) a User with isEmailVerified:true and a JobSeeker
 * profile with isOnboarded:true so the account can reach the dashboard
 * without the email-verification or onboarding gates.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set. Run: node --env-file=.env scripts/seed-test-jobseeker.mjs");
  process.exit(1);
}

const TEST_USER = {
  name: "Aanya Sharma",
  email: "qa.jobseeker@example.com",
  password: "QaSeeker@1234",
};

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, lowercase: true, unique: true },
    passwordHash: String,
    role: String,
    locale: { type: String, default: "en" },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: true },
    authProvider: { type: String, default: "credentials" },
  },
  { timestamps: true, strict: false }
);

const JobSeekerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
    isOnboarded: { type: Boolean, default: true },
  },
  { timestamps: true, strict: false }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const JobSeeker = mongoose.models.JobSeeker || mongoose.model("JobSeeker", JobSeekerSchema);

async function main() {
  console.log("🔌 Connecting…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const passwordHash = await bcrypt.hash(TEST_USER.password, 12);
  const user = await User.findOneAndUpdate(
    { email: TEST_USER.email },
    {
      name: TEST_USER.name,
      email: TEST_USER.email,
      passwordHash,
      role: "job_seeker",
      locale: "en",
      isActive: true,
      isEmailVerified: true,
      authProvider: "credentials",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await JobSeeker.findOneAndUpdate(
    { userId: user._id },
    { userId: user._id, isOnboarded: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`✅  job_seeker  ${TEST_USER.email}  /  ${TEST_USER.password}`);
  console.log("👉 Login at /en/login");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
