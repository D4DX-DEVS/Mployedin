import mongoose from "mongoose";
import dotenv from "dotenv";
import { calculateMatchScore, seekerProfileFromDoc, jobProfileFromDoc } from "./src/lib/matchScore";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection;
  const Users = db.collection("users");
  const Seekers = db.collection("jobseekers");
  const Jobs = db.collection("jobs");
  const Apps = db.collection("applications");

  const user = await Users.findOne({ name: /Muhammed Ilyas/i });
  const seeker = await Seekers.findOne({ userId: user!._id });
  const seekerProfile = seekerProfileFromDoc(seeker as never);

  const applied = await Apps.find({ jobSeekerId: seeker!._id }).project({ jobId: 1 }).toArray();
  const appliedSet = new Set(applied.map((a) => String(a.jobId)));

  const now = new Date();
  const query: Record<string, unknown> = {
    status: "active",
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
      { $or: [{ "location.country": { $in: seeker!.preferredCountries } }, { "location.isRemote": true }] },
    ],
  };
  const jobs = await Jobs.find(query).toArray();

  const scored = jobs
    .filter((j) => !appliedSet.has(String(j._id)))
    .map((j) => ({
      title: j.title,
      country: j.location?.country,
      remote: j.location?.isRemote,
      score: calculateMatchScore(seekerProfile, jobProfileFromDoc(j as never)),
    }))
    .sort((a, b) => b.score - a.score);

  console.log(`\nUNAPPLIED ACTIVE JOBS (country-filtered) — ${scored.length} total, sorted by score:`);
  scored.forEach((j) => console.log(`  ${String(j.score).padStart(3)}%  ${j.title}  [${j.country}${j.remote ? ", remote" : ""}]`));

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
