/**
 * Seed script — create 3 test applicants for the "Full Stack Developer React Backend" job
 *
 * Usage:
 *   node --env-file=.env scripts/seed-applicants.mjs
 *
 * What it does:
 *   1. Finds the job by title (partial match)
 *   2. Creates 3 job_seeker users
 *   3. Creates 3 JobSeeker profiles with realistic skills
 *   4. Creates 3 Applications (status: "applied")
 *
 * To delete seed data:
 *   node --env-file=.env scripts/seed-applicants.mjs --delete
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(
    "❌  MONGODB_URI is not set.\n" +
    "    Dev:  node --env-file=.env scripts/seed-applicants.mjs\n" +
    "    Prod: MONGODB_URI='...' node scripts/seed-applicants.mjs"
  );
  process.exit(1);
}

// ─── Schemas (minimal mirrors) ────────────────────────────────────────────────

const UserSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true },
    email:           { type: String, required: true, unique: true, lowercase: true },
    passwordHash:    { type: String },
    role:            { type: String, enum: ["admin","super_agent","agent","employer","job_seeker"] },
    locale:          { type: String, default: "en" },
    isActive:        { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: true },
    authProvider:    { type: String, default: "credentials" },
    failedLoginAttempts: { type: Number, default: 0 },
    permissionMode:  { type: String, default: "role_default" },
  },
  { timestamps: true }
);

const JobSeekerSchema = new mongoose.Schema(
  {
    userId:              { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    agentId:             { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    fullName:            String,
    nationality:         String,
    dateOfBirth:         Date,
    gender:              String,
    currentLocation:     String,
    skills:              [String],
    suggestedSkills:     [String],
    experience:          [mongoose.Schema.Types.Mixed],
    education:           [mongoose.Schema.Types.Mixed],
    languages:           [mongoose.Schema.Types.Mixed],
    certifications:      [String],
    projects:            [mongoose.Schema.Types.Mixed],
    accomplishments:     [mongoose.Schema.Types.Mixed],
    socialLinks:         [mongoose.Schema.Types.Mixed],
    summary:             String,
    headline:            String,
    workStatus:          String,
    totalExperienceYears:  { type: Number, default: 0 },
    totalExperienceMonths: { type: Number, default: 0 },
    currentSalary:       mongoose.Schema.Types.Mixed,
    industry:            String,
    preferredLocations:  [String],
    preferredCountries:  [String],
    preferredRoles:      [String],
    preferredSalary:     mongoose.Schema.Types.Mixed,
    preferredJobType:    { type: String, default: "any" },
    availabilityStatus:  { type: String, default: "immediately" },
    noticePeriod:        Number,
    applicationMode:     { type: String, default: "manual" },
    autoApplyCount:      { type: Number, default: 0 },
    profileCompleteness: { type: Number, default: 85 },
    profileVisibility:   { type: String, default: "visible" },
    badges:              [String],
    applicationIds:      [{ type: mongoose.Schema.Types.ObjectId }],
    isOnboarded:         { type: Boolean, default: true },
    marketingConsent:    { type: Boolean, default: true },
    cv:                  mongoose.Schema.Types.Mixed,
    documents:           [mongoose.Schema.Types.Mixed],
    workPermitCountries: [{ type: mongoose.Schema.Types.ObjectId }],
    enrolledCourses:     [String],
    completedCourses:    [String],
  },
  { timestamps: true }
);

const ApplicationSchema = new mongoose.Schema(
  {
    jobSeekerId: { type: mongoose.Schema.Types.ObjectId, ref: "JobSeeker", required: true },
    jobId:       { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    employerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Employer", required: true },
    agentId:     { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    status:      { type: String, default: "applied" },
    documents:   [mongoose.Schema.Types.Mixed],
    aiMatchScore: Number,
    matchBreakdown: mongoose.Schema.Types.Mixed,
    matchNotes:  String,
    matchStrengths: [String],
    matchGaps:   [String],
    behaviorSignals: mongoose.Schema.Types.Mixed,
    behaviorScore: Number,
    interviewIds: [{ type: mongoose.Schema.Types.ObjectId }],
    source:      { type: String, default: "full_form" },
    autoApplied: { type: Boolean, default: false },
    notes:       [mongoose.Schema.Types.Mixed],
    appliedAt:   { type: Date, default: Date.now },
    statusHistory: [mongoose.Schema.Types.Mixed],
  },
  { timestamps: true }
);

const JobSchema = new mongoose.Schema({
  employerId:  { type: mongoose.Schema.Types.ObjectId, ref: "Employer" },
  agentId:     { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
  title:       String,
  status:      String,
  applicantIds: [{ type: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true, strict: false });

const User        = mongoose.models.User        || mongoose.model("User",        UserSchema);
const JobSeeker   = mongoose.models.JobSeeker    || mongoose.model("JobSeeker",   JobSeekerSchema);
const Application = mongoose.models.Application  || mongoose.model("Application", ApplicationSchema);
const Job         = mongoose.models.Job          || mongoose.model("Job",         JobSchema);

// ─── Seed data ────────────────────────────────────────────────────────────────

const APPLICANTS = [
  {
    user: {
      name: "Ahmed Rashid",
      email: "ahmed.rashid@test.mployedin.com",
      password: "Applicant@1234",
      role: "job_seeker",
    },
    profile: {
      fullName: "Ahmed Rashid",
      nationality: "UAE",
      dateOfBirth: new Date("1994-03-15"),
      gender: "male",
      currentLocation: "Dubai, UAE",
      headline: "Senior Full Stack Developer | React & Node.js Expert",
      summary: "5+ years of experience building scalable web applications with React, Node.js, and MongoDB. Passionate about clean code, performance optimization, and modern development practices. Have led teams of 3-5 developers on multiple projects.",
      workStatus: "experienced",
      totalExperienceYears: 5,
      totalExperienceMonths: 8,
      skills: ["React", "Node.js", "TypeScript", "MongoDB", "Express.js", "Next.js", "GraphQL", "Docker", "AWS", "Git", "Redux", "Tailwind CSS", "PostgreSQL", "REST API"],
      experience: [
        {
          jobTitle: "Senior Full Stack Developer",
          company: "TechVista Solutions",
          startDate: new Date("2022-01-01"),
          endDate: null,
          isCurrent: true,
          description: "Leading a team of 4 developers building a SaaS platform with React, Node.js, and MongoDB. Implemented CI/CD pipelines, reduced API response times by 40%.",
          country: "UAE",
        },
        {
          jobTitle: "Full Stack Developer",
          company: "Digital Innovations LLC",
          startDate: new Date("2019-06-01"),
          endDate: new Date("2021-12-31"),
          isCurrent: false,
          description: "Developed and maintained multiple React-based web applications. Built RESTful APIs with Express.js and MongoDB.",
          country: "UAE",
        },
      ],
      education: [
        {
          degree: "Bachelor of Science",
          institution: "University of Sharjah",
          field: "Computer Science",
          graduationDate: new Date("2018-06-15"),
          grade: "3.7 GPA",
        },
      ],
      languages: [
        { language: "English", proficiency: "professional", canRead: true, canWrite: true, canSpeak: true },
        { language: "Arabic", proficiency: "native", canRead: true, canWrite: true, canSpeak: true },
      ],
      certifications: ["AWS Certified Developer – Associate", "MongoDB Certified Developer"],
      preferredLocations: ["Dubai", "Abu Dhabi"],
      preferredCountries: ["UAE", "Saudi Arabia"],
      preferredRoles: ["Full Stack Developer", "Senior React Developer", "Backend Developer"],
      preferredSalary: { min: 18000, max: 25000, currency: "AED" },
      currentSalary: { amount: 16000, currency: "AED" },
      preferredJobType: "onsite",
      availabilityStatus: "within_month",
      noticePeriod: 30,
      industry: "Information Technology",
      profileCompleteness: 92,
    },
    matchScore: 88,
    matchBreakdown: { skills: 90, experience: 85, education: 80, availability: 95, overall: 88 },
    matchStrengths: ["Strong React & Node.js experience", "5+ years relevant experience", "Team lead experience", "AWS certified"],
    matchGaps: ["No GraphQL production experience listed"],
  },
  {
    user: {
      name: "Fatima Al-Zahra",
      email: "fatima.alzahra@test.mployedin.com",
      password: "Applicant@1234",
      role: "job_seeker",
    },
    profile: {
      fullName: "Fatima Al-Zahra",
      nationality: "Jordan",
      dateOfBirth: new Date("1996-07-22"),
      gender: "female",
      currentLocation: "Abu Dhabi, UAE",
      headline: "Full Stack Developer | React, TypeScript & Python",
      summary: "3 years of full stack development experience with strong frontend skills in React and TypeScript. Built multiple production applications including e-commerce platforms and admin dashboards. Quick learner with a focus on code quality and testing.",
      workStatus: "experienced",
      totalExperienceYears: 3,
      totalExperienceMonths: 4,
      skills: ["React", "TypeScript", "Python", "Node.js", "Next.js", "MongoDB", "PostgreSQL", "Tailwind CSS", "Jest", "Docker", "Git", "REST API", "Figma"],
      experience: [
        {
          jobTitle: "Full Stack Developer",
          company: "CloudBridge Technologies",
          startDate: new Date("2023-02-01"),
          endDate: null,
          isCurrent: true,
          description: "Building and maintaining a Next.js-based SaaS dashboard with TypeScript. Implemented automated testing with Jest, achieving 85% code coverage.",
          country: "UAE",
        },
        {
          jobTitle: "Frontend Developer",
          company: "StartupHub MENA",
          startDate: new Date("2021-09-01"),
          endDate: new Date("2023-01-31"),
          isCurrent: false,
          description: "Developed responsive React applications for 3 startup clients. Collaborated with backend team on API design and integration.",
          country: "Jordan",
        },
      ],
      education: [
        {
          degree: "Bachelor of Engineering",
          institution: "Jordan University of Science and Technology",
          field: "Software Engineering",
          graduationDate: new Date("2020-06-20"),
          grade: "3.5 GPA",
        },
      ],
      languages: [
        { language: "English", proficiency: "professional", canRead: true, canWrite: true, canSpeak: true },
        { language: "Arabic", proficiency: "native", canRead: true, canWrite: true, canSpeak: true },
        { language: "French", proficiency: "basic", canRead: true, canWrite: false, canSpeak: true },
      ],
      certifications: ["Meta Frontend Developer Professional Certificate"],
      preferredLocations: ["Abu Dhabi", "Dubai"],
      preferredCountries: ["UAE"],
      preferredRoles: ["Full Stack Developer", "Frontend Developer", "React Developer"],
      preferredSalary: { min: 12000, max: 18000, currency: "AED" },
      currentSalary: { amount: 11000, currency: "AED" },
      preferredJobType: "hybrid",
      availabilityStatus: "within_month",
      noticePeriod: 30,
      industry: "Information Technology",
      profileCompleteness: 88,
    },
    matchScore: 76,
    matchBreakdown: { skills: 82, experience: 65, education: 78, availability: 90, overall: 76 },
    matchStrengths: ["Strong React & TypeScript skills", "Testing experience (Jest)", "Good education background"],
    matchGaps: ["Only 3 years experience (job asks for 4+)", "No backend-heavy projects"],
  },
  {
    user: {
      name: "Ravi Krishnan",
      email: "ravi.krishnan@test.mployedin.com",
      password: "Applicant@1234",
      role: "job_seeker",
    },
    profile: {
      fullName: "Ravi Krishnan",
      nationality: "India",
      dateOfBirth: new Date("1991-11-05"),
      gender: "male",
      currentLocation: "Sharjah, UAE",
      headline: "Principal Engineer | Full Stack React, Node.js, Cloud Architecture",
      summary: "8 years of software engineering experience including 6 years in full stack development. Expert in React ecosystem, Node.js microservices, and cloud-native architectures. Previously led engineering for a fintech startup with 500K+ users. Strong in system design and mentoring junior developers.",
      workStatus: "experienced",
      totalExperienceYears: 8,
      totalExperienceMonths: 2,
      skills: ["React", "Node.js", "TypeScript", "MongoDB", "Express.js", "Next.js", "GraphQL", "Docker", "Kubernetes", "AWS", "Redis", "PostgreSQL", "Microservices", "CI/CD", "System Design", "Git", "Redux", "Tailwind CSS"],
      experience: [
        {
          jobTitle: "Principal Software Engineer",
          company: "FinEdge Technologies",
          startDate: new Date("2021-04-01"),
          endDate: null,
          isCurrent: true,
          description: "Architecting and leading development of a fintech platform serving 500K+ users. Designed microservices architecture with Node.js, React frontend, and MongoDB. Reduced deployment time by 70% with Kubernetes.",
          country: "UAE",
        },
        {
          jobTitle: "Senior Full Stack Developer",
          company: "Infosys Ltd",
          startDate: new Date("2018-08-01"),
          endDate: new Date("2021-03-31"),
          isCurrent: false,
          description: "Led a team of 6 developers building enterprise React applications. Implemented real-time features with WebSockets and Redis pub/sub.",
          country: "India",
        },
        {
          jobTitle: "Software Developer",
          company: "Wipro Technologies",
          startDate: new Date("2016-06-01"),
          endDate: new Date("2018-07-31"),
          isCurrent: false,
          description: "Developed web applications using React and Node.js. Built RESTful APIs and database schemas with MongoDB.",
          country: "India",
        },
      ],
      education: [
        {
          degree: "Master of Technology",
          institution: "IIT Madras",
          field: "Computer Science & Engineering",
          graduationDate: new Date("2016-05-15"),
          grade: "8.9 CGPA",
        },
        {
          degree: "Bachelor of Technology",
          institution: "NIT Trichy",
          field: "Information Technology",
          graduationDate: new Date("2014-05-20"),
          grade: "8.5 CGPA",
        },
      ],
      languages: [
        { language: "English", proficiency: "professional", canRead: true, canWrite: true, canSpeak: true },
        { language: "Hindi", proficiency: "native", canRead: true, canWrite: true, canSpeak: true },
        { language: "Tamil", proficiency: "conversational", canRead: true, canWrite: false, canSpeak: true },
      ],
      certifications: ["AWS Solutions Architect – Professional", "Google Cloud Professional Developer", "MongoDB Certified Developer"],
      preferredLocations: ["Dubai", "Abu Dhabi", "Sharjah"],
      preferredCountries: ["UAE", "Saudi Arabia", "Qatar"],
      preferredRoles: ["Principal Engineer", "Senior Full Stack Developer", "Engineering Lead"],
      preferredSalary: { min: 25000, max: 35000, currency: "AED" },
      currentSalary: { amount: 22000, currency: "AED" },
      preferredJobType: "any",
      availabilityStatus: "within_month",
      noticePeriod: 60,
      industry: "Information Technology",
      profileCompleteness: 95,
    },
    matchScore: 94,
    matchBreakdown: { skills: 95, experience: 98, education: 90, availability: 85, overall: 94 },
    matchStrengths: ["8 years experience with React & Node.js", "Microservices & cloud architecture", "Team leadership", "Master's from IIT"],
    matchGaps: ["60-day notice period", "Salary expectation is higher than range"],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

const isDelete = process.argv.includes("--delete");

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  const emails = APPLICANTS.map((a) => a.user.email);

  if (isDelete) {
    // Delete in reverse order (applications → job seekers → users)
    const users = await User.find({ email: { $in: emails } }).lean();
    const userIds = users.map((u) => u._id);

    const jobSeekers = await JobSeeker.find({ userId: { $in: userIds } }).lean();
    const jobSeekerIds = jobSeekers.map((js) => js._id);

    const delApps = await Application.deleteMany({ jobSeekerId: { $in: jobSeekerIds } });
    console.log(`🗑️  Deleted ${delApps.deletedCount} application(s)`);

    // Remove applicantIds from jobs
    await Job.updateMany(
      { applicantIds: { $in: jobSeekerIds } },
      { $pull: { applicantIds: { $in: jobSeekerIds } } }
    );

    const delJS = await JobSeeker.deleteMany({ userId: { $in: userIds } });
    console.log(`🗑️  Deleted ${delJS.deletedCount} job seeker profile(s)`);

    const delUsers = await User.deleteMany({ email: { $in: emails } });
    console.log(`🗑️  Deleted ${delUsers.deletedCount} user(s)`);

    console.log("\n✅ Seed data cleaned up.");
    await mongoose.disconnect();
    return;
  }

  // 1. Find the job
  const job = await Job.findOne({
    title: { $regex: /full.?stack.*developer.*react/i },
    status: { $in: ["active", "pending_approval", "draft"] },
  }).lean();

  if (!job) {
    console.error("❌ Could not find 'Full Stack Developer React Backend' job.");
    console.log("   Available jobs:");
    const jobs = await Job.find({}, "title status").lean();
    jobs.forEach((j) => console.log(`   - [${j.status}] ${j.title}`));
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📋 Found job: "${job.title}" (${job.status})`);
  console.log(`   Job ID: ${job._id}\n`);

  // 2. Create users, profiles, and applications
  for (const applicant of APPLICANTS) {
    const { user: userData, profile, matchScore, matchBreakdown, matchStrengths, matchGaps } = applicant;

    // Upsert user
    const passwordHash = await bcrypt.hash(userData.password, 12);
    const user = await User.findOneAndUpdate(
      { email: userData.email },
      {
        name: userData.name,
        email: userData.email,
        passwordHash,
        role: userData.role,
        locale: "en",
        isActive: true,
        isEmailVerified: true,
        authProvider: "credentials",
        failedLoginAttempts: 0,
        permissionMode: "role_default",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Upsert job seeker profile
    const jobSeeker = await JobSeeker.findOneAndUpdate(
      { userId: user._id },
      { userId: user._id, ...profile },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Upsert application
    const application = await Application.findOneAndUpdate(
      { jobSeekerId: jobSeeker._id, jobId: job._id },
      {
        jobSeekerId: jobSeeker._id,
        jobId: job._id,
        employerId: job.employerId,
        agentId: job.agentId || undefined,
        status: "applied",
        aiMatchScore: matchScore,
        matchBreakdown,
        matchStrengths,
        matchGaps,
        matchNotes: `AI Match: ${matchScore}% — ${matchStrengths[0]}`,
        behaviorSignals: {
          profileCompleteness: profile.profileCompleteness,
          applicationCompleteness: 100,
          companyProfileViewed: true,
          lastActiveAt: new Date(),
        },
        behaviorScore: Math.round(profile.profileCompleteness * 0.85),
        source: "full_form",
        autoApplied: false,
        appliedAt: new Date(Date.now() - Math.floor(Math.random() * 3 * 24 * 60 * 60 * 1000)), // random within last 3 days
        statusHistory: [
          { status: "applied", changedAt: new Date(), note: "Applied via seed script" },
        ],
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    // Add to job's applicantIds if not already present
    await Job.updateOne(
      { _id: job._id, applicantIds: { $ne: jobSeeker._id } },
      { $push: { applicantIds: jobSeeker._id } }
    );

    // Add to job seeker's applicationIds if not already present
    await JobSeeker.updateOne(
      { _id: jobSeeker._id, applicationIds: { $ne: application._id } },
      { $push: { applicationIds: application._id } }
    );

    console.log(`✅ ${userData.name.padEnd(20)} | ${userData.email.padEnd(40)} | Match: ${matchScore}%`);
    console.log(`   Password: ${userData.password}`);
    console.log(`   Skills: ${profile.skills.slice(0, 6).join(", ")}…`);
    console.log(`   Experience: ${profile.totalExperienceYears}y ${profile.totalExperienceMonths}m\n`);
  }

  console.log("─".repeat(70));
  console.log("📊 Summary:");
  console.log(`   Job: ${job.title}`);
  console.log("   3 applicants created with status 'applied'");
  console.log("   All can login at /en/login with password: Applicant@1234");
  console.log("\n   Next steps — test the full workflow:");
  console.log("   1. Shortlist candidates (employer dashboard)");
  console.log("   2. Schedule interviews");
  console.log("   3. Send offers");
  console.log("   4. Complete placements");
  console.log("\n   To delete: node --env-file=.env scripts/seed-applicants.mjs --delete");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
