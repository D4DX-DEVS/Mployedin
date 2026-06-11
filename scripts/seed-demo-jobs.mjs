import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const EMPLOYER_ID = "69d3974275de4cc2682b23a3"; // d4dx
const SEED_TAG = "seed-demo-2026-06";

const jobs = [
  {
    // Partial skill fit (Figma + Adobe XD match; Sketch/InVision/Research don't),
    // experience just outside range, salary slightly below expectation.
    title: "UI/UX Designer",
    description:
      "We are looking for a creative UI/UX Designer to craft intuitive, beautiful product experiences. You will own wireframes, prototypes, and design systems, collaborating closely with engineering.",
    requirements: {
      skills: ["Figma", "Adobe XD", "Sketch", "InVision", "User Research"],
      experienceMin: 3,
      experienceMax: 6,
      education: "Bachelor",
      languages: ["English"],
    },
    salary: { min: 95000, max: 115000, currency: "INR", period: "monthly" },
    location: { country: "India", city: "Kochi", isRemote: false },
    tags: ["Figma", "UI", "UX", SEED_TAG],
  },
  {
    // Strong but not perfect: React + TS match, Next.js related; Redux/GraphQL/Docker missing.
    title: "React Developer",
    description:
      "Join our frontend team as a React Developer building responsive, high-performance web apps with React, TypeScript, and modern tooling.",
    requirements: {
      skills: ["React.js", "TypeScript", "Redux", "Next.js", "GraphQL", "Docker"],
      experienceMin: 2,
      experienceMax: 5,
      education: "Bachelor",
      languages: ["English"],
    },
    salary: { min: 100000, max: 120000, currency: "INR", period: "monthly" },
    location: { country: "India", city: "Bengaluru", isRemote: false },
    tags: ["React", "Frontend", SEED_TAG],
  },
  {
    // MERN core matches + AWS via cloud skill; Docker/GraphQL missing, salary above range.
    title: "Full Stack Developer",
    description:
      "Remote-first Full Stack Developer role using the MERN stack. Build APIs with Node.js/Express, data models in MongoDB, and React frontends end to end.",
    requirements: {
      skills: ["React.js", "Node.js", "Express.js", "MongoDB", "Docker", "AWS", "GraphQL"],
      experienceMin: 3,
      experienceMax: 7,
      education: "Bachelor",
      languages: ["English"],
    },
    salary: { min: 150000, max: 180000, currency: "INR", period: "monthly" },
    location: { country: "India", city: "Remote", isRemote: true },
    workMode: "remote",
    tags: ["MERN", "FullStack", SEED_TAG],
  },
  {
    // Title is not an exact preferred role (no +15 bonus); strong core-web skill fit,
    // salary below expectation so it sits a bit lower.
    title: "Frontend Developer",
    description:
      "Build and maintain customer-facing interfaces with HTML, CSS, and JavaScript. Experience with a modern framework (Vue or Angular) is a plus.",
    requirements: {
      skills: ["HTML", "CSS", "JavaScript", "Vue.js", "Angular"],
      experienceMin: 1,
      experienceMax: 4,
      education: "Bachelor",
      languages: ["English"],
    },
    salary: { min: 80000, max: 100000, currency: "INR", period: "monthly" },
    location: { country: "India", city: "Kozhikode", isRemote: false },
    tags: ["Frontend", "Web", SEED_TAG],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const Jobs = db.collection("jobs");
  const employerId = new mongoose.Types.ObjectId(EMPLOYER_ID);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 24 * 3600_000); // 60 days out

  // Idempotent: remove any prior seed-demo jobs before re-inserting.
  const del = await Jobs.deleteMany({ tags: SEED_TAG });
  console.log("Removed prior seed jobs:", del.deletedCount);

  const docs = jobs.map((j) => ({
    employerId,
    title: j.title,
    description: j.description,
    requirements: {
      skills: j.requirements.skills,
      preferredSkills: [],
      experienceMin: j.requirements.experienceMin,
      experienceMax: j.requirements.experienceMax,
      education: j.requirements.education,
      languages: j.requirements.languages,
      nationality: [],
    },
    salary: {
      min: j.salary.min,
      max: j.salary.max,
      currency: j.salary.currency,
      isNegotiable: false,
      period: j.salary.period,
    },
    location: j.location,
    employmentType: "full_time",
    workMode: j.workMode ?? "onsite",
    status: "active",
    workflowMode: "manual",
    vacancies: 1,
    applicantIds: [],
    poster: { approvalStatus: "approved" },
    showSalary: true,
    views: 0,
    uniqueViews: 0,
    tags: j.tags,
    visibility: "public",
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }));

  const res = await Jobs.insertMany(docs);
  console.log("Inserted jobs:", res.insertedCount);
  Object.values(res.insertedIds).forEach((id, i) => console.log(`  - ${docs[i].title}: ${id.toString()}`));

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
