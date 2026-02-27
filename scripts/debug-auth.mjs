import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

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
  const valid = await bcrypt.compare("Admin@1234", user.passwordHash);
  console.log("Password valid  :", valid);
}

await mongoose.disconnect();
