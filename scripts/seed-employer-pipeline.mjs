/**
 * Seed script — employer hiring-pipeline audit fixture.
 *
 * Creates 12 job seekers + 12 applications (all at "applied") on one job so the
 * employer pipeline can be walked end to end: shortlist -> interview ->
 * background check -> offer.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-employer-pipeline.mjs [jobId]
 *   node --env-file=.env scripts/seed-employer-pipeline.mjs --delete
 *
 * Every seeded account uses the domain @pipeline.mployedin.test so --delete can
 * find them again without touching real data.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/seed-employer-pipeline.mjs");
  process.exit(1);
}

const DEFAULT_JOB_ID = "6a9eee5a571cb7696c8a957b"; // Full Stack Developer (d4dx)
const EMAIL_DOMAIN = "pipeline.mployedin.test";
const PASSWORD = "Applicant@1234";
const RESUME_URL = "https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/Mployedin/documents/1fd27916-8a6d-4000-96ba-9753ca66a257.pdf";

const args = process.argv.slice(2);
const DELETE = args.includes("--delete");
const jobIdArg = args.find((a) => !a.startsWith("--")) ?? DEFAULT_JOB_ID;

// Screening questions attached to the job so the seeded answers have somewhere
// to hang off (the job had none).
const SCREENING_QUESTIONS = [
  { id: "notice", label: "What is your notice period (in days)?", type: "number", required: true, order: 1 },
  { id: "relocate", label: "Are you able to relocate to Dubai?", type: "radio", required: true, options: ["Yes", "No", "Already in Dubai"], order: 2 },
  { id: "mern", label: "Briefly describe your most recent MERN-stack project.", type: "textarea", required: false, order: 3 },
];

// Candidates are deliberately spread across strong / good / mid / weak so
// shortlisting is a real decision rather than a formality.
const CANDIDATES = [
  {
    first: "Ahmed", last: "Rashid", gender: "male", nationality: "UAE",
    location: "Dubai, UAE", headline: "Senior Full Stack Developer | React & Node.js",
    years: 5, months: 8, score: 92,
    skills: ["React", "Node.js", "TypeScript", "MongoDB", "Express.js", "Next.js", "REST APIs", "Docker", "AWS", "Redux"],
    role: "Senior Full Stack Developer", company: "TechVista Solutions",
    strengths: ["5+ years on the exact MERN stack", "Led a team of 4", "AWS certified"],
    gaps: ["No GraphQL in production"],
    answers: { notice: "30", relocate: "Already in Dubai", mern: "Multi-tenant SaaS dashboard on Next.js + Express + MongoDB, 40% faster API responses after query tuning." },
    certifications: ["AWS Certified Developer - Associate", "MongoDB Certified Developer"],
    daysAgo: 9,
  },
  {
    first: "Fatima", last: "AlZahra", gender: "female", nationality: "Jordan",
    location: "Abu Dhabi, UAE", headline: "Full Stack Developer | React, TypeScript & Node",
    years: 4, months: 2, score: 88,
    skills: ["React", "TypeScript", "Node.js", "Next.js", "MongoDB", "Express.js", "REST APIs", "Jest", "Docker", "PostgreSQL"],
    role: "Full Stack Developer", company: "CloudBridge Technologies",
    strengths: ["Strong TypeScript and testing discipline", "Ships production Next.js"],
    gaps: ["Less backend-heavy than the role asks"],
    answers: { notice: "45", relocate: "Yes", mern: "E-commerce admin on MERN with Stripe billing and 85% Jest coverage." },
    certifications: ["Meta Front-End Developer"],
    daysAgo: 8,
  },
  {
    first: "Rohit", last: "Menon", gender: "male", nationality: "India",
    location: "Bengaluru, India", headline: "MERN Engineer | Node.js & MongoDB specialist",
    years: 5, months: 0, score: 85,
    skills: ["Node.js", "Express.js", "MongoDB", "React", "REST APIs", "Redis", "Docker", "AWS", "GraphQL", "Mongoose"],
    role: "Backend Engineer", company: "Nexturn Labs",
    strengths: ["Deep MongoDB and aggregation experience", "GraphQL in production"],
    gaps: ["Needs a work visa for the UAE"],
    answers: { notice: "60", relocate: "Yes", mern: "Order-management service on Express + MongoDB handling 2M docs with aggregation pipelines." },
    certifications: ["MongoDB Associate Developer"],
    daysAgo: 8,
  },
  {
    first: "Layla", last: "Haddad", gender: "female", nationality: "Lebanon",
    location: "Dubai, UAE", headline: "Full Stack Developer | MERN & DevOps",
    years: 3, months: 6, score: 81,
    skills: ["React", "Node.js", "Express.js", "MongoDB", "Docker", "CI/CD", "REST APIs", "Tailwind CSS", "Git"],
    role: "Full Stack Developer", company: "Levant Digital",
    strengths: ["Owns her own CI/CD", "Already resident in Dubai"],
    gaps: ["No TypeScript experience listed"],
    answers: { notice: "30", relocate: "Already in Dubai", mern: "Internal HR portal, React + Node, deployed on Docker Swarm." },
    certifications: [],
    daysAgo: 7,
  },
  {
    first: "Daniel", last: "Okonkwo", gender: "male", nationality: "Nigeria",
    location: "Lagos, Nigeria", headline: "Software Engineer | React + Node.js",
    years: 4, months: 0, score: 78,
    skills: ["React", "Node.js", "MongoDB", "Express.js", "JavaScript", "REST APIs", "Git", "Jest"],
    role: "Software Engineer", company: "Paystack Partners",
    strengths: ["Solid MERN fundamentals", "Fintech domain experience"],
    gaps: ["No cloud or DevOps exposure", "Remote time-zone gap"],
    answers: { notice: "30", relocate: "Yes", mern: "Merchant payouts dashboard, React + Express + MongoDB." },
    certifications: [],
    daysAgo: 7,
  },
  {
    first: "Sara", last: "Kapoor", gender: "female", nationality: "India",
    location: "Pune, India", headline: "Full Stack Developer | Next.js & Express",
    years: 3, months: 2, score: 74,
    skills: ["Next.js", "React", "Node.js", "Express.js", "MongoDB", "Tailwind CSS", "REST APIs"],
    role: "Full Stack Developer", company: "Infobyte Systems",
    strengths: ["Next.js App Router experience", "Fast turnaround on UI work"],
    gaps: ["Only 3 years against a 2-5 band", "No Docker or AWS"],
    answers: { notice: "90", relocate: "Yes", mern: "Booking platform on Next.js with an Express API and MongoDB Atlas." },
    certifications: [],
    daysAgo: 6,
  },
  {
    first: "Omar", last: "Farouk", gender: "male", nationality: "Egypt",
    location: "Cairo, Egypt", headline: "Backend Developer | Node.js",
    years: 6, months: 0, score: 69,
    skills: ["Node.js", "Express.js", "MongoDB", "MySQL", "REST APIs", "Docker", "Linux"],
    role: "Backend Developer", company: "Cairo Software House",
    strengths: ["Six years of Node.js", "Comfortable with infrastructure"],
    gaps: ["Almost no React", "Above the experience band"],
    answers: { notice: "60", relocate: "Yes", mern: "Logistics tracking API on Node + MongoDB; the frontend was another team's." },
    certifications: [],
    daysAgo: 6,
  },
  {
    first: "Priya", last: "Nair", gender: "female", nationality: "India",
    location: "Kochi, India", headline: "Frontend Developer | React",
    years: 3, months: 8, score: 62,
    skills: ["React", "JavaScript", "Redux", "HTML", "CSS", "Tailwind CSS", "Figma"],
    role: "Frontend Developer", company: "Bluewave Interactive",
    strengths: ["Strong React and UI craft"],
    gaps: ["No backend or MongoDB experience", "Not a full stack profile"],
    answers: { notice: "30", relocate: "Yes", mern: "Frontend only - consumed a MERN API built by colleagues." },
    certifications: [],
    daysAgo: 5,
  },
  {
    first: "Yusuf", last: "Bakr", gender: "male", nationality: "Sudan",
    location: "Sharjah, UAE", headline: "Junior Full Stack Developer",
    years: 1, months: 6, score: 55,
    skills: ["React", "Node.js", "MongoDB", "JavaScript", "Git"],
    role: "Junior Developer", company: "Sharjah Tech Hub",
    strengths: ["In the UAE already", "Available immediately"],
    gaps: ["Below the 2-year minimum", "No production ownership"],
    answers: { notice: "0", relocate: "Already in Dubai", mern: "Bootcamp capstone: a MERN blog with auth." },
    certifications: [],
    daysAgo: 5,
  },
  {
    first: "Hana", last: "Tesfaye", gender: "female", nationality: "Ethiopia",
    location: "Addis Ababa, Ethiopia", headline: "Web Developer | PHP & JavaScript",
    years: 4, months: 0, score: 48,
    skills: ["PHP", "Laravel", "JavaScript", "MySQL", "jQuery", "HTML", "CSS"],
    role: "Web Developer", company: "Addis Web Studio",
    strengths: ["Four years shipping web apps"],
    gaps: ["Wrong stack - LAMP, not MERN", "No React or Node"],
    answers: { notice: "30", relocate: "Yes", mern: "None - my work has been Laravel and MySQL." },
    certifications: [],
    daysAgo: 4,
  },
  {
    first: "Vikram", last: "Sethi", gender: "male", nationality: "India",
    location: "Delhi, India", headline: "QA Engineer moving into development",
    years: 5, months: 0, score: 41,
    skills: ["Selenium", "JavaScript", "Cypress", "Manual Testing", "Jira", "SQL"],
    role: "QA Engineer", company: "Testbridge Services",
    strengths: ["Understands the product from the test side"],
    gaps: ["No development role to date", "No MongoDB or Express"],
    answers: { notice: "60", relocate: "Yes", mern: "I have tested MERN applications but not built one." },
    certifications: ["ISTQB Foundation"],
    daysAgo: 3,
  },
  {
    first: "Grace", last: "Mwangi", gender: "female", nationality: "Kenya",
    location: "Nairobi, Kenya", headline: "Graduate Software Engineer",
    years: 0, months: 8, score: 36,
    skills: ["JavaScript", "React", "HTML", "CSS", "Python", "Git"],
    role: "Intern Developer", company: "Nairobi Devworks",
    strengths: ["Recent CS graduate, quick learner"],
    gaps: ["Under a year of experience", "No commercial backend work"],
    answers: { notice: "0", relocate: "Yes", mern: "University project: a React frontend with a small Node API." },
    certifications: [],
    daysAgo: 2,
  },
];

// Minimal schema mirrors - the script writes documents the app models own, so
// everything but User is deliberately non-strict.
const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, lowercase: true }, passwordHash: String, role: String,
  locale: { type: String, default: "en" }, isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true }, authProvider: { type: String, default: "credentials" },
  failedLoginAttempts: { type: Number, default: 0 }, permissionMode: { type: String, default: "role_default" },
}, { timestamps: true, strict: false });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const JobSeeker = mongoose.models.JobSeeker || mongoose.model("JobSeeker", new mongoose.Schema({}, { timestamps: true, strict: false }));
const Application = mongoose.models.Application || mongoose.model("Application", new mongoose.Schema({}, { timestamps: true, strict: false }));
const Job = mongoose.models.Job || mongoose.model("Job", new mongoose.Schema({}, { timestamps: true, strict: false }));

const emailOf = (c) => `${c.first}.${c.last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@" + EMAIL_DOMAIN;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  await mongoose.connect(MONGODB_URI);
  const emails = CANDIDATES.map(emailOf);

  if (DELETE) {
    const users = await User.find({ email: { $in: emails } }, "_id").lean();
    const userIds = users.map((u) => u._id);
    const seekers = await JobSeeker.find({ userId: { $in: userIds } }, "_id").lean();
    const seekerIds = seekers.map((s) => s._id);
    const apps = await Application.find({ jobSeekerId: { $in: seekerIds } }, "_id").lean();
    const appIds = apps.map((a) => a._id);

    for (const coll of ["interviews", "offers", "backgroundchecks", "hiringdecisions", "placements"]) {
      const r = await mongoose.connection.db.collection(coll).deleteMany({ applicationId: { $in: appIds } });
      if (r.deletedCount) console.log(`deleted ${r.deletedCount} from ${coll}`);
    }
    console.log(`deleted ${(await Application.deleteMany({ _id: { $in: appIds } })).deletedCount} applications`);
    await Job.updateMany({}, { $pull: { applicantIds: { $in: seekerIds } } });
    console.log(`deleted ${(await JobSeeker.deleteMany({ _id: { $in: seekerIds } })).deletedCount} job seekers`);
    console.log(`deleted ${(await User.deleteMany({ _id: { $in: userIds } })).deletedCount} users`);
    await mongoose.disconnect();
    return;
  }

  const job = await Job.findById(jobIdArg).lean();
  if (!job) { console.error(`Job ${jobIdArg} not found`); process.exit(1); }
  console.log(`Job: "${job.title}" (${job.status})  id=${job._id}`);

  // Make the job itself complete enough to audit: a vacancy count for the hires
  // strip, and screening questions so the seeded answers render.
  await Job.updateOne({ _id: job._id }, {
    $set: {
      vacancies: job.vacancies ?? 3,
      screeningQuestions: job.screeningQuestions?.length ? job.screeningQuestions : SCREENING_QUESTIONS,
    },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const c of CANDIDATES) {
    const email = emailOf(c);
    const fullName = `${c.first} ${c.last}`;
    const completeness = Math.min(95, 55 + Math.round(c.score / 3));

    const user = await User.findOneAndUpdate(
      { email },
      {
        name: fullName, email, passwordHash, role: "job_seeker", locale: "en",
        isActive: true, isEmailVerified: true, authProvider: "credentials",
        failedLoginAttempts: 0, permissionMode: "role_default",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    const seeker = await JobSeeker.findOneAndUpdate(
      { userId: user._id },
      {
        userId: user._id,
        fullName,
        nationality: c.nationality,
        gender: c.gender,
        dateOfBirth: new Date(1993 + (c.years % 7), (c.months + 2) % 12, 12),
        currentLocation: c.location,
        headline: c.headline,
        summary: `${c.headline}. ${c.years} year${c.years === 1 ? "" : "s"} of experience, most recently as ${c.role} at ${c.company}.`,
        workStatus: c.years >= 1 ? "experienced" : "fresher",
        totalExperienceYears: c.years,
        totalExperienceMonths: c.months,
        skills: c.skills,
        experience: [{
          jobTitle: c.role, company: c.company,
          startDate: daysAgo(365 * Math.max(c.years, 1)), endDate: null, isCurrent: true,
          description: `${c.role} at ${c.company}.`, country: c.location.split(", ").pop(),
        }],
        education: [{
          degree: "Bachelor of Technology", institution: "State University",
          field: "Computer Science", graduationDate: daysAgo(365 * (c.years + 4)), grade: "First class",
        }],
        languages: [{ language: "English", proficiency: "professional", canRead: true, canWrite: true, canSpeak: true }],
        certifications: c.certifications,
        preferredLocations: ["Dubai"],
        preferredCountries: ["United Arab Emirates"],
        preferredRoles: ["Full Stack Developer"],
        preferredJobType: "onsite",
        availabilityStatus: Number(c.answers.notice) <= 30 ? "immediately" : "within_month",
        noticePeriod: Number(c.answers.notice),
        industry: "Information Technology",
        profileCompleteness: completeness,
        profileVisibility: "visible",
        isOnboarded: true,
        marketingConsent: true,
        documents: [{ name: `${fullName} CV.pdf`, url: RESUME_URL, type: "resume", uploadedAt: daysAgo(c.daysAgo + 2) }],
        // The applications list only offers "View CV" when the seeker profile
        // carries cv.originalUrl — application.documents alone is not enough.
        cv: {
          originalUrl: RESUME_URL,
          parsedAt: daysAgo(c.daysAgo + 2),
          rawText: `${fullName}\n${c.headline}\n${c.location}\n\nSkills: ${c.skills.join(", ")}\n\nExperience\n${c.role}, ${c.company} — ${c.years}y ${c.months}m\n\nEducation\nBachelor of Technology, Computer Science`,
          downloadCount: 0,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    const appliedAt = daysAgo(c.daysAgo);
    const app = await Application.findOneAndUpdate(
      { jobSeekerId: seeker._id, jobId: job._id },
      {
        jobSeekerId: seeker._id, jobId: job._id, employerId: job.employerId,
        ...(job.agentId ? { agentId: job.agentId } : {}),
        status: "applied",
        documents: [{ name: `${fullName} CV.pdf`, url: RESUME_URL, type: "resume" }],
        aiMatchScore: c.score,
        scoredVia: "deterministic",
        matchBreakdown: {
          skills: c.score,
          experience: Math.max(10, c.score - 6),
          education: Math.min(95, c.score + 8),
          availability: Number(c.answers.notice) <= 30 ? 95 : 70,
          overall: c.score,
        },
        matchNotes: `${c.score}% match - ${c.strengths[0]}`,
        matchStrengths: c.strengths,
        matchGaps: c.gaps,
        behaviorSignals: {
          responseTime: 2 + (c.daysAgo % 5),
          coverLetterCustomized: c.score >= 70,
          profileCompleteness: completeness,
          applicationCompleteness: 100,
          companyProfileViewed: c.score >= 60,
          lastActiveAt: daysAgo(Math.max(0, c.daysAgo - 2)),
        },
        behaviorScore: Math.round(c.score * 0.9),
        screeningAnswers: SCREENING_QUESTIONS.map((q) => ({
          questionId: q.id, questionLabel: q.label, answer: c.answers[q.id],
        })),
        interviewIds: [],
        source: c.score >= 70 ? "full_form" : "easy_apply",
        autoApplied: false,
        viewedByEmployerAt: null,
        notes: [],
        appliedAt,
        statusHistory: [{ status: "applied", changedAt: appliedAt, note: "Application submitted" }],
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    await Job.updateOne({ _id: job._id, applicantIds: { $ne: seeker._id } }, { $push: { applicantIds: seeker._id } });
    await JobSeeker.updateOne({ _id: seeker._id, applicationIds: { $ne: app._id } }, { $push: { applicationIds: app._id } });

    console.log(`  ${fullName.padEnd(18)} ${String(c.score).padStart(3)}%  ${email}`);
  }

  const total = await Application.countDocuments({ jobId: job._id });
  console.log(`\n${CANDIDATES.length} applications seeded at "applied". Job now has ${total} applications.`);
  console.log(`Seeker login password: ${PASSWORD}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
