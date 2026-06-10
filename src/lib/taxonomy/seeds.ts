/**
 * Curated fallback taxonomy lists for the job-seeker autocomplete.
 *
 * These seeds guarantee useful suggestions even when the corresponding
 * master-data collections (JobSkill, Industry, Country, City, MajorSubject)
 * are empty or sparse. The /api/taxonomy endpoint merges DB results with
 * these lists, de-duplicated case-insensitively.
 */

export type TaxonomyType =
  | "skills"
  | "roles"
  | "locations"
  | "countries"
  | "specializations"
  | "industries";

export const TAXONOMY_TYPES: readonly TaxonomyType[] = [
  "skills",
  "roles",
  "locations",
  "countries",
  "specializations",
  "industries",
] as const;

const SKILLS: string[] = [
  "JavaScript", "TypeScript", "React.js", "Next.js", "Node.js", "Express.js",
  "Vue.js", "Angular", "HTML", "CSS", "Tailwind CSS", "Redux", "GraphQL",
  "Python", "Django", "Flask", "FastAPI", "Java", "Spring Boot", "C#", ".NET",
  "PHP", "Laravel", "Ruby on Rails", "Go", "Rust", "Kotlin", "Swift",
  "MongoDB", "MySQL", "PostgreSQL", "Redis", "SQL", "Firebase", "Supabase",
  "AWS", "Microsoft Azure", "Google Cloud", "Docker", "Kubernetes", "Terraform",
  "CI/CD", "Git", "GitHub Actions", "Jenkins", "Linux", "Nginx",
  "REST APIs", "Microservices", "System Design", "Data Structures",
  "Machine Learning", "Data Analysis", "Power BI", "Tableau", "Excel",
  "Figma", "Adobe XD", "Sketch", "UI Design", "UX Research", "Wireframing",
  "Project Management", "Agile", "Scrum", "Jira", "Product Management",
  "Digital Marketing", "SEO", "Content Writing", "Copywriting",
  "Accounting", "Financial Analysis", "Sales", "Customer Service",
  "Communication", "Leadership", "Problem Solving", "Teamwork",
  "AutoCAD", "SolidWorks", "Logistics", "Supply Chain", "HR Management",
];

const ROLES: string[] = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "React Developer", "Node.js Developer", "Software Engineer",
  "Senior Software Engineer", "Mobile Developer", "Android Developer",
  "iOS Developer", "DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer",
  "Data Engineer", "Data Analyst", "Data Scientist", "Machine Learning Engineer",
  "QA Engineer", "Automation Test Engineer", "UI/UX Designer", "Product Designer",
  "Graphic Designer", "Product Manager", "Project Manager", "Scrum Master",
  "Business Analyst", "Engineering Manager", "Technical Lead", "Solutions Architect",
  "Digital Marketing Manager", "SEO Specialist", "Content Writer",
  "Sales Executive", "Account Manager", "Customer Success Manager",
  "HR Manager", "Recruiter", "Accountant", "Financial Analyst",
  "Operations Manager", "Supply Chain Manager", "Civil Engineer",
  "Mechanical Engineer", "Electrical Engineer", "Network Engineer",
  "Cybersecurity Analyst", "Database Administrator",
];

const LOCATIONS: string[] = [
  "Dubai", "Abu Dhabi", "Sharjah", "Riyadh", "Jeddah", "Dammam",
  "Doha", "Kuwait City", "Manama", "Muscat", "Cairo",
  "Mumbai", "Bengaluru", "Delhi / NCR", "Hyderabad", "Chennai", "Pune",
  "Kolkata", "Ahmedabad", "Kochi", "Kozhikode", "Ernakulam", "Thiruvananthapuram",
  "London", "Singapore", "Toronto", "New York", "Remote",
];

const COUNTRIES: string[] = [
  "UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "India", "United Kingdom", "United States", "Canada",
  "Singapore", "Germany", "Australia", "Remote",
];

const SPECIALIZATIONS: string[] = [
  "Computer Science and Engineering (CSE)", "Information Technology",
  "Electronics and Communication", "Electrical Engineering",
  "Mechanical Engineering", "Civil Engineering", "Chemical Engineering",
  "Data Science", "Artificial Intelligence", "Cyber Security",
  "Software Engineering", "Mathematics", "Physics", "Statistics",
  "Finance", "Accounting", "Marketing", "Human Resources",
  "Business Administration", "Economics", "Commerce",
  "Mass Communication", "Graphic Design", "Architecture",
];

const INDUSTRIES: string[] = [
  "IT Services & Consulting", "Software Product", "Analytics / KPO / Research",
  "BPM / BPO", "Banking / Financial Services", "Insurance",
  "Healthcare / Pharma", "E-commerce", "Manufacturing",
  "Education / Training", "Retail", "Logistics / Supply Chain",
  "Oil & Gas", "Construction / Real Estate", "Hospitality",
  "Media / Entertainment", "Telecom", "Automotive", "FMCG",
  "Government / Public Sector",
];

export const TAXONOMY_SEEDS: Record<TaxonomyType, string[]> = {
  skills: SKILLS,
  roles: ROLES,
  locations: LOCATIONS,
  countries: COUNTRIES,
  specializations: SPECIALIZATIONS,
  industries: INDUSTRIES,
};
