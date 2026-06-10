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
  // ── Tech / IT ──
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "React Developer", "Node.js Developer", "Software Engineer",
  "Senior Software Engineer", "Mobile Developer", "Android Developer",
  "iOS Developer", "DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer",
  "Data Engineer", "Data Analyst", "Data Scientist", "Machine Learning Engineer",
  "QA Engineer", "Automation Test Engineer", "UI/UX Designer", "Product Designer",
  "Graphic Designer", "Product Manager", "Project Manager", "Scrum Master",
  "Business Analyst", "Engineering Manager", "Technical Lead", "Solutions Architect",
  "Network Engineer", "Cybersecurity Analyst", "Database Administrator",
  "IT Support Specialist", "System Administrator", "ERP Consultant",
  // ── Marketing / Sales / Office ──
  "Digital Marketing Manager", "Digital Marketing Executive", "SEO Specialist",
  "Content Writer", "Social Media Manager", "Telemarketing Executive",
  "Sales Executive", "Sales Manager", "Account Manager", "Customer Success Manager",
  "Customer Service Representative", "Call Center Agent", "Telesales Executive",
  "Business Development Executive", "Business Development Manager",
  "Receptionist", "Office Administrator", "Administrative Assistant",
  "Executive Assistant", "Personal Assistant", "Secretary", "Data Entry Operator",
  "Document Controller", "Office Boy",
  // ── HR / Finance / Legal ──
  "HR Manager", "HR Executive", "HR Officer", "Recruiter", "Talent Acquisition Specialist",
  "Payroll Officer", "Accountant", "Senior Accountant", "Junior Accountant",
  "Financial Analyst", "Finance Manager", "Auditor", "Internal Auditor",
  "Cashier", "Bookkeeper", "Tax Consultant", "Legal Advisor", "Paralegal",
  // ── Engineering / Construction ──
  "Civil Engineer", "Mechanical Engineer", "Electrical Engineer",
  "Site Engineer", "Project Engineer", "Planning Engineer", "Quantity Surveyor",
  "Land Surveyor", "Architect", "Draftsman", "AutoCAD Draftsman", "Estimator",
  "HVAC Engineer", "HVAC Technician", "MEP Engineer", "Maintenance Engineer",
  "Construction Manager", "Site Supervisor", "Foreman", "Safety Officer",
  "HSE Officer", "HSE Engineer", "Quality Control Inspector", "QA/QC Engineer",
  // ── Skilled Trades / Technicians ──
  "Electrician", "Plumber", "Welder", "Carpenter", "Mason", "Painter",
  "Steel Fixer", "Scaffolder", "Rigger", "Fabricator", "Pipe Fitter",
  "Mechanic", "Auto Mechanic", "Auto Electrician", "Denter", "Heavy Equipment Operator",
  "Crane Operator", "Forklift Operator", "Excavator Operator", "Machine Operator",
  "CNC Operator", "Lathe Operator", "AC Technician", "Refrigeration Technician",
  "Elevator Technician", "Generator Technician", "Maintenance Technician",
  "Electronics Technician", "CCTV Technician", "Lab Technician", "Solar Technician",
  // ── Transport / Logistics / Warehouse ──
  "Driver", "Light Vehicle Driver", "Heavy Truck Driver", "Delivery Driver",
  "Taxi Driver", "Bus Driver", "Motorcycle Rider", "Delivery Boy",
  "Logistics Coordinator", "Logistics Manager", "Supply Chain Manager",
  "Warehouse Supervisor", "Warehouse Assistant", "Storekeeper", "Store Manager",
  "Inventory Controller", "Procurement Officer", "Purchasing Manager",
  "Freight Forwarder", "Customs Clearance Officer",
  // ── Hospitality / Food / Retail ──
  "Chef", "Head Chef", "Sous Chef", "Commis Chef", "Pastry Chef", "Baker",
  "Cook", "Kitchen Helper", "Waiter", "Waitress", "Barista", "Bartender",
  "Restaurant Manager", "Restaurant Supervisor", "Captain", "Hostess",
  "Housekeeping Supervisor", "Housekeeping Attendant", "Room Attendant",
  "Front Desk Agent", "Front Office Executive", "Concierge", "Hotel Manager",
  "Steward", "Butcher", "Salesman", "Sales Associate", "Shop Assistant",
  "Cashier (Retail)", "Merchandiser", "Visual Merchandiser",
  // ── Healthcare / Education / Care ──
  "Nurse", "Registered Nurse", "Staff Nurse", "Head Nurse", "Home Care Nurse",
  "Doctor", "General Practitioner", "Dentist", "Dental Assistant",
  "Pharmacist", "Pharmacy Assistant", "Physiotherapist", "Radiographer",
  "Medical Laboratory Technologist", "Medical Coder", "Medical Receptionist",
  "Caregiver", "Nanny", "Babysitter", "Teacher", "English Teacher",
  "Mathematics Teacher", "Science Teacher", "Kindergarten Teacher",
  "Teaching Assistant", "School Counselor", "Tutor", "Trainer",
  // ── Security / Cleaning / General ──
  "Security Guard", "Security Supervisor", "Lifeguard", "Cleaner",
  "Office Cleaner", "Janitor", "Gardener", "Landscaper", "Pest Control Technician",
  "Laundry Attendant", "Tailor", "Barber", "Hairdresser", "Beautician",
  "Spa Therapist", "Massage Therapist", "Fitness Trainer", "Helper",
  "General Labour", "Factory Worker", "Production Worker", "Packing Helper",
  // ── Management / Operations ──
  "Operations Manager", "Operations Executive", "General Manager",
  "Branch Manager", "Area Manager", "Facility Manager", "Property Manager",
  "Real Estate Agent", "Property Consultant", "Leasing Consultant",
  "Camp Boss", "Public Relations Officer (PRO)", "Travel Consultant",
  "Ticketing Agent", "Flight Attendant", "Ground Staff",
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
