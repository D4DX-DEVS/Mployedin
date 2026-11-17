/**
 * Varied job-seeker seed with full Mployedin CVs (QA 2026-11-17).
 *
 * Ten seekers across different fields, countries, pay and seniority, each with
 * the profile a CV built on Mployedin is printed from — headline, summary,
 * dated jobs with bullet points, education, skills, projects, languages,
 * certifications, links, career profile — plus a saved `cvDesign`, which is
 * what makes "My CVs" offer the built CV (api/job-seeker/documents hasBuiltCv).
 * Each uses a different CV template.
 *
 * Use it to check that matching ranks the right jobs for each person: some
 * fields have jobs on staging (developer, HR, accountant, QA, designer, site
 * engineer, teacher, nurse), some sit outside them on purpose (DevOps abroad,
 * heavy vehicle technician).
 *
 * Every account: <key>@variedseekers.test / SeekerQa@1234
 *
 * NOTE: .env points at the shared staging database — these accounts appear
 * there. Remove them with --delete when done. Re-running replaces them.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-varied-seekers.mjs           (reset + seed)
 *   node --env-file=.env scripts/seed-varied-seekers.mjs --delete  (remove only)
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run: node --env-file=.env scripts/seed-varied-seekers.mjs");
  process.exit(1);
}

const DOMAIN = "variedseekers.test";
const PASSWORD = "SeekerQa@1234";
const TERMS_BASELINE_VERSION = "2026-09-29"; // src/lib/gdpr/termsVersion.ts

const d = (iso) => new Date(iso);
const bullets = (...lines) => lines.map((l) => `• ${l}`).join("\n");

/** A cvDesign the builder accepts (src/lib/jobSeeker/cvDesign.ts). */
const design = (templateId, themeColor, extra = {}) => ({
  templateId,
  formatting: {
    font: "inter",
    fontSize: "medium",
    spacing: "medium",
    themeColor,
    pageFormat: "a4",
    dateFormat: "short",
    lineHeight: "normal",
    margin: "normal",
    sectionOrder: ["experience", "projects", "skills", "education", "certifications", "languages"],
    ...extra,
  },
  hiddenSections: [],
});

const lang = (language, proficiency) => ({ language, proficiency, canRead: true, canWrite: true, canSpeak: true });

const SEEKERS = [
  {
    key: "react-dev",
    name: "Anjali Menon",
    nationality: "Indian",
    gender: "female",
    dob: "1997-04-12",
    location: "Kochi, Kerala, India",
    headline: "Frontend Developer · React, TypeScript, Next.js",
    summary:
      "Frontend developer with 4 years building fast, accessible web apps in React and Next.js. Shipped a B2B dashboard used by 300+ companies and cut its load time by 45%. Comfortable owning features end to end, from Figma hand-off to Node.js APIs and CI.",
    workStatus: "experienced",
    years: 4,
    months: 3,
    experience: [
      {
        jobTitle: "Frontend Developer",
        company: "Qburst Technologies",
        startDate: d("2023-02-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Lead developer on a React + TypeScript analytics dashboard for 300+ B2B customers",
          "Moved the app to Next.js server components; first load fell from 4.1s to 2.2s",
          "Built a shared component library (40 components) with Storybook and Jest tests",
          "Mentor two junior developers and run weekly code reviews",
        ),
      },
      {
        jobTitle: "Junior Web Developer",
        company: "Techgentsia Software",
        startDate: d("2021-08-01"),
        endDate: d("2023-01-31"),
        isCurrent: false,
        country: "India",
        description: bullets(
          "Built responsive marketing sites and admin panels in React and Tailwind CSS",
          "Wrote REST endpoints in Node.js / Express with MongoDB",
          "Raised Lighthouse accessibility scores from 68 to 96 across 12 pages",
        ),
      },
    ],
    education: [
      { degree: "B.Tech", field: "Computer Science and Engineering", institution: "College of Engineering Trivandrum", startYear: 2017, graduationDate: d("2021-06-30"), grade: "8.4 CGPA" },
      { degree: "Higher Secondary (Class XII)", field: "Computer Science", institution: "Government Model HSS, Ernakulam", startYear: 2015, graduationDate: d("2017-03-31"), grade: "94%" },
    ],
    skills: ["React", "TypeScript", "JavaScript", "Next.js", "Redux", "Tailwind CSS", "HTML", "CSS", "Node.js", "Express.js", "MongoDB", "Jest", "Git", "REST APIs", "Figma"],
    projects: [
      { title: "Clinic booking app", description: "Next.js app for a 6-doctor clinic: online booking, WhatsApp reminders, admin calendar.", techStack: ["Next.js", "TypeScript", "Prisma", "PostgreSQL"], projectUrl: "https://example.com/clinic", startDate: d("2024-03-01"), endDate: d("2024-06-30") },
      { title: "Open-source date picker", description: "Accessible React date picker, 1.2k weekly npm downloads.", techStack: ["React", "TypeScript"], repoUrl: "https://github.com/example/date-picker", startDate: d("2022-09-01"), isCurrent: true },
    ],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Hindi", "conversational")],
    certifications: ["Meta Front-End Developer Professional Certificate", "AWS Certified Cloud Practitioner"],
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example-anjali" }, { label: "GitHub", url: "https://github.com/example-anjali" }],
    career: { currentIndustry: "Information Technology", department: "Engineering - Software", roleCategory: "Software Development", jobRole: "Frontend Developer", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["Frontend Developer", "React Developer", "Full Stack Developer"], countries: ["India"], locations: ["Kochi", "Bengaluru", "Remote"], salary: { min: 70000, max: 110000, currency: "INR" }, jobType: "hybrid", relocate: true, notice: 30, availability: "within_month" },
    current: { amount: 65000, currency: "INR" },
    cv: design("modern", "blue"),
  },
  {
    key: "devops-gulf",
    name: "Rahul Nair",
    nationality: "Indian",
    gender: "male",
    dob: "1990-11-03",
    location: "Doha, Qatar",
    headline: "Senior DevOps Engineer · AWS, Kubernetes, Terraform",
    summary:
      "DevOps engineer with 8 years running production platforms on AWS and Azure. Built the CI/CD and Kubernetes platform for a Qatari fintech processing 2M transactions a day at 99.95% uptime. Looking for senior platform roles in Qatar or the UAE.",
    workStatus: "experienced",
    years: 8,
    months: 6,
    experience: [
      {
        jobTitle: "Senior DevOps Engineer",
        company: "Gulf Pay Solutions",
        startDate: d("2021-05-01"),
        isCurrent: true,
        country: "Qatar",
        description: bullets(
          "Own the EKS platform (14 clusters) and the Terraform for 3 AWS accounts",
          "Cut deploy time from 40 minutes to 6 with GitHub Actions and Argo CD",
          "Brought cloud spend down 28% with right-sizing and spot instances",
          "On-call lead; wrote the incident runbooks and SLO dashboards (Prometheus, Grafana)",
        ),
      },
      {
        jobTitle: "DevOps Engineer",
        company: "Infosys",
        startDate: d("2017-06-01"),
        endDate: d("2021-04-30"),
        isCurrent: false,
        country: "India",
        description: bullets(
          "Ran Jenkins pipelines and Docker builds for 30+ microservices",
          "Migrated on-prem VMs to Azure with zero data loss",
          "Automated server hardening with Ansible across 400 Linux hosts",
        ),
      },
    ],
    education: [{ degree: "B.E.", field: "Information Technology", institution: "Anna University", startYear: 2013, graduationDate: d("2017-05-31"), grade: "First Class" }],
    skills: ["AWS", "Kubernetes", "Docker", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "Argo CD", "Linux", "Prometheus", "Grafana", "Python", "Bash", "Azure"],
    projects: [{ title: "Self-service environments", description: "Developers spin up a full preview environment per pull request in 4 minutes.", techStack: ["Kubernetes", "Argo CD", "Terraform"], startDate: d("2023-01-01"), endDate: d("2023-07-31") }],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Arabic", "basic")],
    certifications: ["Certified Kubernetes Administrator (CKA)", "AWS Certified Solutions Architect – Professional", "HashiCorp Certified: Terraform Associate"],
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example-rahul" }],
    career: { currentIndustry: "Financial Services", department: "Engineering - Software", roleCategory: "DevOps", jobRole: "DevOps Engineer", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "flexible" },
    prefs: { roles: ["DevOps Engineer", "Platform Engineer", "Site Reliability Engineer"], countries: ["Qatar", "United Arab Emirates"], locations: ["Doha", "Dubai"], salary: { min: 18000, max: 26000, currency: "QAR" }, jobType: "any", relocate: true, notice: 60, availability: "within_3_months" },
    current: { amount: 17000, currency: "QAR" },
    cv: design("technical", "slate"),
  },
  {
    key: "hr-manager",
    name: "Fathima Rasheed",
    nationality: "Indian",
    gender: "female",
    dob: "1988-07-21",
    location: "Kochi, Kerala, India",
    headline: "HR Manager · Talent acquisition, HRMS, labour law",
    summary:
      "HR professional with 7 years across recruitment, onboarding and employee relations for IT and manufacturing firms. Ran hiring for 180 roles a year, rolled out an HRMS for 600 staff and kept attrition under 11%.",
    workStatus: "experienced",
    years: 7,
    months: 2,
    experience: [
      {
        jobTitle: "HR Manager",
        company: "Malabar Polymers Ltd",
        startDate: d("2022-01-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Lead a 4-person HR team for 600 employees across 2 plants",
          "Rolled out Zoho People HRMS: payroll, leave and appraisals in one place",
          "Handle disciplinary cases and labour law compliance (Factories Act, ESI, PF)",
          "Brought voluntary attrition from 17% to 10.8% in two years",
        ),
      },
      {
        jobTitle: "Senior HR Executive – Talent Acquisition",
        company: "UST Global",
        startDate: d("2018-06-01"),
        endDate: d("2021-12-31"),
        isCurrent: false,
        country: "India",
        description: bullets(
          "Hired 180+ engineers a year; cut time-to-hire from 46 to 29 days",
          "Ran campus drives at 12 engineering colleges",
          "Owned onboarding for new joiners, 40 a month at peak",
        ),
      },
    ],
    education: [
      { degree: "MBA", field: "Human Resource Management", institution: "Rajagiri Centre for Business Studies", startYear: 2016, graduationDate: d("2018-05-31"), grade: "A" },
      { degree: "B.Com", field: "Commerce", institution: "St. Teresa's College, Ernakulam", startYear: 2013, graduationDate: d("2016-04-30"), grade: "78%" },
    ],
    skills: ["HR practices", "Recruitment", "Onboarding", "Employee lifecycle management", "HRMS", "Labor laws", "Conflict resolution", "Payroll", "Performance management", "HR analytics", "Compliance"],
    projects: [],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Hindi", "professional")],
    certifications: ["SHRM Certified Professional (SHRM-CP)", "Certificate in Labour Laws – Kerala Management Association"],
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example-fathima" }],
    career: { currentIndustry: "Manufacturing", department: "Human Resources", roleCategory: "HR Management", jobRole: "HR Manager", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["HR Manager", "HR Business Partner", "Talent Acquisition Lead"], countries: ["India"], locations: ["Kochi", "Thrissur"], salary: { min: 80000, max: 140000, currency: "INR" }, jobType: "onsite", relocate: false, notice: 60, availability: "within_3_months" },
    current: { amount: 85000, currency: "INR" },
    cv: design("professional", "teal"),
  },
  {
    key: "accountant",
    name: "Vishnu Prasad",
    nationality: "Indian",
    gender: "male",
    dob: "1996-02-14",
    location: "Kozhikode, Kerala, India",
    headline: "Accountant · Tally, GST, month-end close",
    summary:
      "Accountant with 3 years keeping the books for a trading company and an audit firm. Handle GST and TDS returns, bank reconciliation and month-end close in Tally Prime and Zoho Books. CA Intermediate cleared.",
    workStatus: "experienced",
    years: 3,
    months: 4,
    experience: [
      {
        jobTitle: "Accountant",
        company: "Calicut Traders Pvt Ltd",
        startDate: d("2023-04-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Full books for a ₹40 crore trading business in Tally Prime",
          "File monthly GST (GSTR-1, 3B) and quarterly TDS returns",
          "Close the month in 5 working days, down from 9",
        ),
      },
      {
        jobTitle: "Audit Assistant",
        company: "Menon & Associates, Chartered Accountants",
        startDate: d("2021-07-01"),
        endDate: d("2023-03-31"),
        isCurrent: false,
        country: "India",
        description: bullets("Statutory and tax audits for 25 clients", "Prepared working papers and fixed-asset schedules"),
      },
    ],
    education: [
      { degree: "M.Com", field: "Finance", institution: "University of Calicut", startYear: 2019, graduationDate: d("2021-05-31"), grade: "72%" },
      { degree: "B.Com", field: "Accounting", institution: "Farook College, Kozhikode", startYear: 2016, graduationDate: d("2019-04-30"), grade: "81%" },
    ],
    skills: ["Tally Prime", "GST", "TDS", "Accounting", "Bank reconciliation", "Zoho Books", "MS Excel", "Financial reporting", "Accounts payable", "Accounts receivable"],
    projects: [],
    languages: [lang("English", "professional"), lang("Malayalam", "native")],
    certifications: ["CA Intermediate (ICAI) – both groups cleared", "Tally Prime Certified Professional"],
    links: [],
    career: { currentIndustry: "Trading", department: "Finance & Accounts", roleCategory: "Accounting", jobRole: "Accountant", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["Accountant", "Accounts Executive", "Senior Accountant"], countries: ["India", "United Arab Emirates"], locations: ["Kozhikode", "Kochi", "Dubai"], salary: { min: 30000, max: 45000, currency: "INR" }, jobType: "onsite", relocate: true, notice: 30, availability: "within_month" },
    current: { amount: 28000, currency: "INR" },
    cv: design("classic", "cyan"),
  },
  {
    key: "nurse",
    name: "Merin Thomas",
    nationality: "Indian",
    gender: "female",
    dob: "1994-09-30",
    location: "Kottayam, Kerala, India",
    headline: "Registered Nurse (B.Sc) · ICU and home care",
    summary:
      "Registered nurse with 5 years in ICU and home care. Kerala Nursing Council registered, BLS and ACLS certified, DHA Prometric passed. Looking for staff nurse roles in Kuwait or the UAE.",
    workStatus: "experienced",
    years: 5,
    months: 0,
    experience: [
      {
        jobTitle: "Staff Nurse – ICU",
        company: "Caritas Hospital, Kottayam",
        startDate: d("2021-11-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Care for 2–3 ventilated patients per shift in a 24-bed medical ICU",
          "Run central line and ventilator-associated pneumonia bundles",
          "Train new nurses on the unit's infection-control checklist",
        ),
      },
      {
        jobTitle: "Home Care Nurse",
        company: "Lifecare Home Health",
        startDate: d("2019-10-01"),
        endDate: d("2021-10-31"),
        isCurrent: false,
        country: "India",
        description: bullets("Post-operative and palliative care at home for 8–10 patients a week", "Wound care, IV therapy and medication charts"),
      },
    ],
    education: [{ degree: "B.Sc Nursing", field: "Nursing", institution: "Government College of Nursing, Kottayam", startYear: 2015, graduationDate: d("2019-08-31"), grade: "First Class" }],
    skills: ["Patient care", "ICU nursing", "IV therapy", "Wound care", "Medication administration", "Infection control", "BLS", "ACLS", "Home care", "Electronic health records"],
    projects: [],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Hindi", "conversational"), lang("Arabic", "basic")],
    certifications: ["Kerala Nurses and Midwives Council Registration", "DHA Prometric – passed", "Basic Life Support (BLS)", "Advanced Cardiovascular Life Support (ACLS)"],
    links: [],
    career: { currentIndustry: "Healthcare", department: "Healthcare & Life Sciences", roleCategory: "Nursing", jobRole: "Staff Nurse", desiredJobType: ["permanent", "contractual"], desiredEmploymentType: ["full_time"], preferredShift: "rotational" },
    prefs: { roles: ["Registered Nurse", "Staff Nurse", "ICU Nurse"], countries: ["Kuwait", "United Arab Emirates", "India"], locations: ["Kuwait City", "Dubai", "Kottayam"], salary: { min: 350, max: 550, currency: "KWD" }, jobType: "onsite", relocate: true, notice: 30, availability: "within_month" },
    current: { amount: 32000, currency: "INR" },
    cv: design("elegant", "rose"),
  },
  {
    key: "vehicle-tech",
    name: "Suresh Kumar",
    nationality: "Indian",
    gender: "male",
    dob: "1985-05-08",
    location: "Sharjah, United Arab Emirates",
    headline: "Heavy Vehicle Technician · Buses, trucks, diesel engines",
    summary:
      "Heavy vehicle technician with 11 years on buses and trucks in the UAE and India. Diagnose and repair diesel engines, air brakes and gearboxes; hold a UAE heavy vehicle licence. Want a workshop lead role in the UAE.",
    workStatus: "experienced",
    years: 11,
    months: 0,
    experience: [
      {
        jobTitle: "Heavy Vehicle Technician",
        company: "Emirates Transport Workshop",
        startDate: d("2018-03-01"),
        isCurrent: true,
        country: "United Arab Emirates",
        description: bullets(
          "Service and repair a fleet of 220 school buses and trucks",
          "Diagnose engine faults with Cummins INSITE and Volvo Tech Tool",
          "Cut repeat breakdowns 30% with a preventive maintenance schedule",
        ),
      },
      {
        jobTitle: "Diesel Mechanic",
        company: "Tata Motors Authorised Service, Coimbatore",
        startDate: d("2014-01-01"),
        endDate: d("2018-02-28"),
        isCurrent: false,
        country: "India",
        description: bullets("Engine overhauls and air-brake repairs on Tata trucks and Force Travellers", "Trained 6 apprentices"),
      },
    ],
    education: [{ degree: "ITI", field: "Mechanic Diesel", institution: "Government ITI, Coimbatore", startYear: 2011, graduationDate: d("2013-07-31"), grade: "86%" }],
    skills: ["Heavy Vehicle Repair", "Diesel engines", "Air brakes", "Engine diagnostics", "Preventive maintenance", "Gearbox repair", "Hydraulics", "Welding"],
    projects: [],
    languages: [lang("English", "conversational"), lang("Tamil", "native"), lang("Hindi", "conversational"), lang("Arabic", "basic")],
    certifications: ["UAE Heavy Vehicle Driving Licence", "Cummins Engine Diagnostics – Level 2"],
    links: [],
    career: { currentIndustry: "Automotive", department: "Maintenance", roleCategory: "Automobile Technician", jobRole: "Heavy Vehicle Technician", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["Heavy Vehicle Technician", "Workshop Supervisor", "Diesel Mechanic"], countries: ["United Arab Emirates"], locations: ["Sharjah", "Dubai", "Abu Dhabi"], salary: { min: 4500, max: 7000, currency: "AED" }, jobType: "onsite", relocate: false, notice: 30, availability: "within_month" },
    current: { amount: 4200, currency: "AED" },
    cv: design("compact", "orange"),
  },
  {
    key: "qa-fresher",
    name: "Aditya Varma",
    nationality: "Indian",
    gender: "male",
    dob: "2002-12-01",
    location: "Kochi, Kerala, India",
    headline: "QA Tester (fresher) · Selenium, manual testing, SQL",
    summary:
      "2025 B.Tech graduate starting a career in software testing. Six-month QA internship writing manual test cases and Selenium scripts; ISTQB Foundation certified. Happy to start as a trainee or intern.",
    workStatus: "fresher",
    years: 0,
    months: 6,
    experience: [
      {
        jobTitle: "QA Intern",
        company: "Experion Technologies",
        startDate: d("2025-01-06"),
        endDate: d("2025-06-30"),
        isCurrent: false,
        country: "India",
        description: bullets(
          "Wrote 250+ manual test cases for a logistics web app",
          "Automated 40 regression tests in Selenium WebDriver with Java and TestNG",
          "Logged and tracked 120 bugs in Jira",
        ),
      },
    ],
    education: [{ degree: "B.Tech", field: "Information Technology", institution: "Model Engineering College, Kochi", startYear: 2021, graduationDate: d("2025-06-30"), grade: "7.6 CGPA" }],
    skills: ["Manual Testing", "Selenium", "Test cases", "Jira", "SQL", "Java", "TestNG", "API Testing", "Postman", "Agile"],
    projects: [{ title: "Automation suite for an e-commerce demo site", description: "Page-object Selenium suite with 60 tests running in GitHub Actions.", techStack: ["Selenium", "Java", "TestNG", "GitHub Actions"], repoUrl: "https://github.com/example/qa-suite", startDate: d("2024-08-01"), endDate: d("2024-11-30") }],
    languages: [lang("English", "professional"), lang("Malayalam", "native")],
    certifications: ["ISTQB Certified Tester – Foundation Level", "Postman API Fundamentals Student Expert"],
    links: [{ label: "GitHub", url: "https://github.com/example-aditya" }],
    career: { currentIndustry: "Information Technology", department: "Quality Assurance", roleCategory: "Software Testing", jobRole: "QA Tester", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time", "internship"], preferredShift: "day" },
    prefs: { roles: ["QA Tester", "Software Tester", "QA Intern"], countries: ["India"], locations: ["Kochi", "Thiruvananthapuram"], salary: { min: 10000, max: 20000, currency: "INR" }, jobType: "any", relocate: true, notice: 0, availability: "immediately" },
    current: null,
    cv: design("minimal", "green"),
  },
  {
    key: "teacher",
    name: "Sneha George",
    nationality: "Indian",
    gender: "female",
    dob: "1992-03-18",
    location: "Thrissur, Kerala, India",
    headline: "Science Teacher · CBSE and IGCSE, Grades 6–10",
    summary:
      "Science teacher with 6 years teaching CBSE and IGCSE physics and chemistry. Class results above 92% three years running; run the school science club and lab safety programme. Open to schools in Kuwait and the UAE.",
    workStatus: "experienced",
    years: 6,
    months: 5,
    experience: [
      {
        jobTitle: "Science Teacher",
        company: "Devamatha CMI Public School, Thrissur",
        startDate: d("2020-06-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Teach physics and chemistry to Grades 8–10 (CBSE), 5 sections",
          "Board results: 94% average, 18 students above 95",
          "Started the school's STEM club and an annual science fair",
        ),
      },
      {
        jobTitle: "Middle School Science Teacher",
        company: "Sunrise International School",
        startDate: d("2018-06-01"),
        endDate: d("2020-05-31"),
        isCurrent: false,
        country: "India",
        description: bullets("IGCSE science for Grades 6–8", "Built lab activity sheets used by the whole department"),
      },
    ],
    education: [
      { degree: "B.Ed", field: "Physical Science", institution: "NSS Training College, Ottapalam", startYear: 2016, graduationDate: d("2018-04-30"), grade: "A+" },
      { degree: "M.Sc", field: "Physics", institution: "St. Thomas College, Thrissur", startYear: 2014, graduationDate: d("2016-05-31"), grade: "76%" },
    ],
    skills: ["Science teaching", "Physics", "Chemistry", "Lesson planning", "CBSE curriculum", "IGCSE", "Classroom management", "Lab safety", "Bilingual (English/Arabic)"],
    projects: [],
    languages: [lang("English", "native"), lang("Malayalam", "native"), lang("Arabic", "basic")],
    certifications: ["CTET – Paper II qualified", "Cambridge Certificate in Teaching and Learning"],
    links: [],
    career: { currentIndustry: "Education", department: "Teaching & Training", roleCategory: "School Teaching", jobRole: "Science Teacher", desiredJobType: ["permanent", "contractual"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["Science Teacher", "Physics Teacher", "PGT Physics"], countries: ["Kuwait", "United Arab Emirates", "India"], locations: ["Kuwait City", "Dubai", "Thrissur"], salary: { min: 600, max: 900, currency: "KWD" }, jobType: "onsite", relocate: true, notice: 60, availability: "within_3_months" },
    current: { amount: 38000, currency: "INR" },
    cv: design("academic", "purple"),
  },
  {
    key: "ui-designer",
    name: "Arjun Das",
    nationality: "Indian",
    gender: "male",
    dob: "1998-08-25",
    location: "Bengaluru, Karnataka, India",
    headline: "UI/UX Designer · Figma, design systems, user research",
    summary:
      "Product designer with 3 years designing mobile and web apps for fintech and edtech start-ups. Built a Figma design system of 120 components and ran the user research behind a 22% lift in sign-up completion.",
    workStatus: "experienced",
    years: 3,
    months: 8,
    experience: [
      {
        jobTitle: "UI/UX Designer",
        company: "Jupiter Money",
        startDate: d("2023-05-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Own the design of savings and payments flows in the iOS / Android app",
          "Built and maintain a Figma design system (120 components, light and dark)",
          "Ran 30 user interviews and usability tests a quarter",
        ),
      },
      {
        jobTitle: "Graphic & UI Designer",
        company: "Byju's",
        startDate: d("2021-11-01"),
        endDate: d("2023-04-30"),
        isCurrent: false,
        country: "India",
        description: bullets("Designed course landing pages and in-app illustrations", "Produced 200+ social media creatives in Adobe Illustrator and Photoshop"),
      },
    ],
    education: [{ degree: "B.Des", field: "Communication Design", institution: "Srishti Manipal Institute of Art, Design and Technology", startYear: 2017, graduationDate: d("2021-06-30"), grade: "8.1 CGPA" }],
    skills: ["Figma", "Adobe XD", "UI Design", "UX Research", "Prototyping", "Design systems", "Wireframing", "Adobe Photoshop", "Adobe Illustrator", "Usability testing", "CSS"],
    projects: [{ title: "Design system 'Orbit'", description: "Token-based Figma system shared by 4 product squads.", techStack: ["Figma", "Tokens Studio"], projectUrl: "https://example.com/orbit", startDate: d("2023-08-01"), isCurrent: true }],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Kannada", "conversational")],
    certifications: ["Google UX Design Professional Certificate"],
    links: [{ label: "Portfolio", url: "https://example.com/arjun-portfolio" }, { label: "Dribbble", url: "https://dribbble.com/example-arjun" }],
    career: { currentIndustry: "Financial Technology", department: "UX, Design & Architecture", roleCategory: "UI/UX Design", jobRole: "UI/UX Designer", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["UI/UX Designer", "Product Designer"], countries: ["India"], locations: ["Bengaluru", "Kochi", "Remote"], salary: { min: 60000, max: 95000, currency: "INR" }, jobType: "remote", relocate: false, notice: 30, availability: "within_month" },
    current: { amount: 62000, currency: "INR" },
    cv: design("creative", "indigo"),
  },
  {
    key: "site-engineer",
    name: "Nikhil Raj",
    nationality: "Indian",
    gender: "male",
    dob: "1995-01-09",
    location: "Thrissur, Kerala, India",
    headline: "Civil Site Engineer · Residential and commercial buildings",
    summary:
      "Civil engineer with 5 years running sites for residential towers and commercial blocks up to G+12. Handle execution, quantity surveying, AutoCAD drawings and site safety; delivered two projects ahead of schedule.",
    workStatus: "experienced",
    years: 5,
    months: 1,
    experience: [
      {
        jobTitle: "Site Engineer",
        company: "Sobha Limited",
        startDate: d("2022-03-01"),
        isCurrent: true,
        country: "India",
        description: bullets(
          "Run day-to-day execution on a G+12 residential tower with 60 workers",
          "Prepare bar bending schedules and BOQs; check contractor bills",
          "Zero lost-time incidents across 900 days on site",
        ),
      },
      {
        jobTitle: "Junior Site Engineer",
        company: "Thrissur Builders",
        startDate: d("2020-07-01"),
        endDate: d("2022-02-28"),
        isCurrent: false,
        country: "India",
        description: bullets("Supervised foundation and structural work on 3 commercial blocks", "Kept daily progress reports and material registers"),
      },
    ],
    education: [{ degree: "B.Tech", field: "Civil Engineering", institution: "Government Engineering College, Thrissur", startYear: 2016, graduationDate: d("2020-06-30"), grade: "7.9 CGPA" }],
    skills: ["AutoCAD", "Civil Engineering", "Site execution", "Quantity surveying", "BOQ", "Bar bending schedule", "Safety", "MS Project", "Concrete technology", "Contractor management"],
    projects: [],
    languages: [lang("English", "professional"), lang("Malayalam", "native"), lang("Hindi", "conversational")],
    certifications: ["NEBOSH International General Certificate", "Primavera P6 – Project Planning"],
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example-nikhil" }],
    career: { currentIndustry: "Construction", department: "Construction & Site Engineering", roleCategory: "Civil Engineering", jobRole: "Site Engineer", desiredJobType: ["permanent"], desiredEmploymentType: ["full_time"], preferredShift: "day" },
    prefs: { roles: ["Site Engineer", "Civil Engineer", "Project Engineer"], countries: ["India", "Oman"], locations: ["Thrissur", "Kochi", "Muscat"], salary: { min: 40000, max: 65000, currency: "INR" }, jobType: "onsite", relocate: true, notice: 30, availability: "within_month" },
    current: { amount: 42000, currency: "INR" },
    cv: design("timeline", "amber"),
  },
];

const email = (key) => `${key}@${DOMAIN}`;

async function removeSeeded(db) {
  const users = await db.collection("users").find({ email: { $regex: `@${DOMAIN.replace(".", "\\.")}$` } }).project({ _id: 1 }).toArray();
  const userIds = users.map((u) => u._id);
  const seekerIds = (await db.collection("jobseekers").find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray()).map((s) => s._id);
  await Promise.all([
    db.collection("jobseekers").deleteMany({ _id: { $in: seekerIds } }),
    db.collection("notifications").deleteMany({ userId: { $in: userIds } }),
  ]);
  await db.collection("users").deleteMany({ _id: { $in: userIds } });
  console.log(`Removed ${userIds.length} users / ${seekerIds.length} job seekers on @${DOMAIN}.`);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  await removeSeeded(db);
  if (process.argv.includes("--delete")) {
    await mongoose.disconnect();
    return;
  }

  const settings = await db.collection("systemsettings").findOne({}, { projection: { legalTermsVersion: 1 } });
  const termsVersion = settings?.legalTermsVersion || TERMS_BASELINE_VERSION;
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  for (const s of SEEKERS) {
    const { insertedId: userId } = await db.collection("users").insertOne({
      name: s.name,
      email: email(s.key),
      passwordHash,
      role: "job_seeker",
      permissionMode: "role_default",
      locale: "en",
      isActive: true,
      isEmailVerified: true,
      termsAcceptedVersion: termsVersion,
      termsAcceptedAt: now,
      authProvider: "credentials",
      failedLoginAttempts: 0,
      passwordResetAttempts: 0,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.collection("jobseekers").insertOne({
      userId,
      fullName: s.name,
      nationality: s.nationality,
      gender: s.gender,
      dateOfBirth: d(s.dob),
      currentLocation: s.location,
      isAgentReferred: false,
      isOnboarded: true,
      badges: [],
      profileVisibility: "visible",
      roleArchivedAt: null,
      workPermitCountries: [],
      headline: s.headline,
      summary: s.summary,
      workStatus: s.workStatus,
      totalExperienceYears: s.years,
      totalExperienceMonths: s.months,
      ...(s.current ? { currentSalary: s.current } : {}),
      skills: s.skills,
      suggestedSkills: [],
      experience: s.experience,
      education: s.education,
      languages: s.languages,
      certifications: s.certifications,
      projects: s.projects,
      accomplishments: s.certifications.map((title) => ({ type: "certification", title })),
      socialLinks: s.links,
      careerProfile: s.career,
      preferredRoles: s.prefs.roles,
      preferredCountries: s.prefs.countries,
      preferredLocations: s.prefs.locations,
      preferredSalary: s.prefs.salary,
      preferredJobType: s.prefs.jobType,
      openToRelocation: s.prefs.relocate,
      noticePeriod: s.prefs.notice,
      availabilityStatus: s.prefs.availability,
      availabilityStatusSetAt: now,
      applicationMode: "manual",
      autoApplyCount: 0,
      marketingConsent: false,
      cv: {},
      cvDesign: s.cv,
      documents: [],
      profileCompleteness: 95,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  ${email(s.key).padEnd(34)} ${s.headline}`);
  }

  console.log(`Seeded ${SEEKERS.length} job seekers (password in this file's header).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
