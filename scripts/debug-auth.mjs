import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!MONGODB_URI || !ADMIN_PASSWORD) {
  throw new Error("MONGODB_URI and SEED_ADMIN_PASSWORD are required");
}

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  passwordHash: String,
  role: String,
  isActive: Boolean,
  isEmailVerified: Boolean,
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);

await mongoose.connect(MONGODB_URI);

const user = await User.findOne({ email: "admin@mployedin.com" });
console.log("User found      :", !!user);
console.log("isActive        :", user?.isActive);
console.log("Has passwordHash:", !!(user?.passwordHash));
console.log("Hash starts with:", user?.passwordHash?.substring(0, 7));

if (user?.passwordHash) {
  const valid = await bcrypt.compare(ADMIN_PASSWORD, user.passwordHash);
  console.log("Password valid  :", valid);
}

await mongoose.disconnect();
