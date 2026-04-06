/**
 * One-time script: removes duplicate slug "c" entries from jobskills collection,
 * then re-inserts the correct slugs for "C#" (c-sharp) and "C++" (c-plus-plus).
 *
 * Usage:  node scripts/fix-duplicate-slug.mjs
 */

import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

const col = mongoose.connection.collection("jobskills");

// 1. Show current duplicates
const dups = await col.find({ slug: "c" }).toArray();
console.log(`Found ${dups.length} docs with slug="c":`, dups.map((d) => ({ _id: d._id, name: d.name })));

// 2. Delete ALL docs with slug "c" (both C# and C++ got merged into this)
const del = await col.deleteMany({ slug: "c" });
console.log(`Deleted ${del.deletedCount} duplicate slug="c" docs`);

// 3. Also clean up any existing c-sharp / c-plus-plus to avoid re-insert conflicts
await col.deleteMany({ slug: { $in: ["c-sharp", "c-plus-plus"] } });
console.log("Cleaned up any existing c-sharp / c-plus-plus entries");

// 4. Insert the corrected documents
const now = new Date();
const base = { nameAr: "", isActive: true, createdAt: now, updatedAt: now };

await col.insertMany([
  { ...base, name: "C#",  slug: "c-sharp",     sortOrder: 4 },
  { ...base, name: "C++", slug: "c-plus-plus",  sortOrder: 5 },
]);
console.log("Inserted C# (c-sharp) and C++ (c-plus-plus) with correct slugs");

await mongoose.disconnect();
console.log("Done ✅");
