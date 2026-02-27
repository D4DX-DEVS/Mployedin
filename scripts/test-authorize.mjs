/**
 * Direct test of the authorize logic used in NextAuth config
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

// Same schema as models/User.ts
const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, lowercase: true },
    passwordHash: { type: String, select: false },
    role: String,
    locale: String,
    isActive: Boolean,
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.models.User || mongoose.model("User", UserSchema);

await mongoose.connect(MONGODB_URI);

const email = "admin@mployedin.com";
const password = "Admin@1234";

console.log("--- Testing authorize() logic ---");

const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).select("+passwordHash");
console.log("User found     :", !!user);
console.log("Has hash       :", !!(user?.passwordHash));

if (user?.passwordHash) {
  const valid = await user.comparePassword(password);
  console.log("Password valid :", valid);

  if (valid) {
    console.log("\n✅ Would return user object:");
    console.log({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
    });
  } else {
    console.log("❌ Password mismatch — authorize() would return null");
  }
} else {
  console.log("❌ No passwordHash — authorize() would return null");
}

await mongoose.disconnect();
