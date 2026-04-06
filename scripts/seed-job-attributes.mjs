/**
 * Seed script — populate all 16 Job Attribute master data collections
 * with internationally standard values (English + Arabic).
 *
 * Usage:  node scripts/seed-job-attributes.mjs
 *
 * Safe to re-run: uses insertMany with ordered:false to skip duplicates.
 */

import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://devd4dx:ssbrXQOYyQ3jA99K@developer.bakh5qk.mongodb.net/mployedin?retryWrites=true&w=majority&appName=Developer";

// ─── Helper ───────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    // Replace common programming symbols before stripping
    .replace(/\+\+/g, "-plus-plus")
    .replace(/\+/g, "-plus")
    .replace(/#/g, "-sharp")
    .replace(/\./g, "-")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildDocs(items) {
  return items.map(([name, nameAr], i) => ({
    name,
    nameAr: nameAr || "",
    slug: slugify(name),
    sortOrder: i,
    isActive: true,
  }));
}

// ─── Minimal schemas (mirror src/models/) ─────────────────────────────────────
const attrSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

function getModel(name) {
  return mongoose.models[name] || mongoose.model(name, attrSchema);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DATA  — [English Name, Arabic Name]
// ═══════════════════════════════════════════════════════════════════════════════

const SALARY_PERIODS = [
  ["Hourly", "بالساعة"],
  ["Daily", "يومي"],
  ["Weekly", "أسبوعي"],
  ["Bi-Weekly", "نصف شهري"],
  ["Monthly", "شهري"],
  ["Yearly", "سنوي"],
];

const OWNERSHIP_TYPES = [
  ["Sole Proprietorship", "ملكية فردية"],
  ["Partnership", "شراكة"],
  ["Limited Liability Company (LLC)", "شركة ذات مسؤولية محدودة"],
  ["Corporation", "شركة مساهمة"],
  ["Government", "حكومي"],
  ["Non-Profit Organization", "منظمة غير ربحية"],
  ["Semi-Government", "شبه حكومي"],
  ["Free Zone", "منطقة حرة"],
];

const MARITAL_STATUSES = [
  ["Single", "أعزب"],
  ["Married", "متزوج"],
  ["Divorced", "مطلق"],
  ["Widowed", "أرمل"],
];

const RESULT_TYPES = [
  ["Distinction", "امتياز"],
  ["First Division", "القسم الأول"],
  ["Second Division", "القسم الثاني"],
  ["Third Division", "القسم الثالث"],
  ["Pass", "ناجح"],
  ["GPA", "معدل تراكمي"],
  ["Percentage", "نسبة مئوية"],
  ["CGPA", "المعدل التراكمي العام"],
];

const MAJOR_SUBJECTS = [
  ["Accounting", "محاسبة"],
  ["Aerospace Engineering", "هندسة الفضاء"],
  ["Agriculture", "زراعة"],
  ["Arabic Language & Literature", "اللغة العربية وآدابها"],
  ["Architecture", "هندسة معمارية"],
  ["Artificial Intelligence", "ذكاء اصطناعي"],
  ["Biochemistry", "كيمياء حيوية"],
  ["Biology", "أحياء"],
  ["Biomedical Engineering", "هندسة طبية حيوية"],
  ["Business Administration", "إدارة أعمال"],
  ["Chemical Engineering", "هندسة كيميائية"],
  ["Chemistry", "كيمياء"],
  ["Civil Engineering", "هندسة مدنية"],
  ["Communication & Media", "إعلام واتصال"],
  ["Computer Engineering", "هندسة حاسوب"],
  ["Computer Science", "علوم حاسوب"],
  ["Cybersecurity", "أمن سيبراني"],
  ["Data Science", "علم البيانات"],
  ["Dentistry", "طب أسنان"],
  ["Economics", "اقتصاد"],
  ["Education", "تربية"],
  ["Electrical Engineering", "هندسة كهربائية"],
  ["English Language & Literature", "اللغة الإنجليزية وآدابها"],
  ["Environmental Science", "علوم بيئية"],
  ["Fashion Design", "تصميم أزياء"],
  ["Finance", "مالية"],
  ["Fine Arts", "فنون جميلة"],
  ["Food Science", "علوم الغذاء"],
  ["Geology", "جيولوجيا"],
  ["Graphic Design", "تصميم جرافيك"],
  ["Health Sciences", "علوم صحية"],
  ["History", "تاريخ"],
  ["Hospitality Management", "إدارة الضيافة"],
  ["Human Resources", "موارد بشرية"],
  ["Industrial Engineering", "هندسة صناعية"],
  ["Information Systems", "نظم معلومات"],
  ["Information Technology", "تكنولوجيا المعلومات"],
  ["Interior Design", "تصميم داخلي"],
  ["International Relations", "علاقات دولية"],
  ["Islamic Studies", "دراسات إسلامية"],
  ["Law", "قانون"],
  ["Library Science", "علم المكتبات"],
  ["Linguistics", "لغويات"],
  ["Marketing", "تسويق"],
  ["Mathematics", "رياضيات"],
  ["Mechanical Engineering", "هندسة ميكانيكية"],
  ["Medicine", "طب"],
  ["Nursing", "تمريض"],
  ["Petroleum Engineering", "هندسة بترول"],
  ["Pharmacy", "صيدلة"],
  ["Philosophy", "فلسفة"],
  ["Physics", "فيزياء"],
  ["Political Science", "علوم سياسية"],
  ["Psychology", "علم نفس"],
  ["Public Administration", "إدارة عامة"],
  ["Public Health", "صحة عامة"],
  ["Real Estate", "عقارات"],
  ["Social Work", "خدمة اجتماعية"],
  ["Sociology", "علم اجتماع"],
  ["Software Engineering", "هندسة برمجيات"],
  ["Statistics", "إحصاء"],
  ["Supply Chain Management", "إدارة سلسلة التوريد"],
  ["Telecommunications", "اتصالات"],
  ["Tourism & Travel", "سياحة وسفر"],
  ["Urban Planning", "تخطيط حضري"],
  ["Veterinary Medicine", "طب بيطري"],
];

const DEGREE_TYPES = [
  ["Certificate", "شهادة"],
  ["Diploma", "دبلوم"],
  ["Associate Degree", "درجة مشارك"],
  ["Bachelor's Degree", "بكالوريوس"],
  ["Postgraduate Diploma", "دبلوم دراسات عليا"],
  ["Master's Degree", "ماجستير"],
  ["Doctorate (PhD)", "دكتوراه"],
  ["Professional Degree", "درجة مهنية"],
  ["Post-Doctoral", "ما بعد الدكتوراه"],
];

const DEGREE_LEVELS = [
  ["Non-Matriculation", "ما قبل الثانوية"],
  ["Matriculation / O-Level", "الثانوية العامة"],
  ["Intermediate / A-Level", "مرحلة ما بعد الثانوية"],
  ["Vocational / Technical", "مهني / تقني"],
  ["Associate", "مشارك"],
  ["Bachelor", "بكالوريوس"],
  ["Master", "ماجستير"],
  ["Doctorate", "دكتوراه"],
];

const JOB_SHIFTS = [
  ["Morning", "صباحي"],
  ["Afternoon", "بعد الظهر"],
  ["Evening", "مسائي"],
  ["Night", "ليلي"],
  ["Rotating", "متناوب"],
  ["Split Shift", "نوبة مقسمة"],
  ["Flexible", "مرن"],
  ["On-Call", "تحت الطلب"],
];

const JOB_TYPES = [
  ["Full-Time", "دوام كامل"],
  ["Part-Time", "دوام جزئي"],
  ["Contract", "عقد"],
  ["Temporary", "مؤقت"],
  ["Internship", "تدريب"],
  ["Freelance", "عمل حر"],
  ["Remote", "عن بعد"],
  ["Volunteer", "تطوعي"],
];

const JOB_SKILLS = [
  // ── Technical ──
  ["JavaScript", "جافاسكريبت"],
  ["TypeScript", "تايبسكريبت"],
  ["Python", "بايثون"],
  ["Java", "جافا"],
  ["C#", "سي شارب"],
  ["C++", "سي بلس بلس"],
  ["PHP", "بي إتش بي"],
  ["Ruby", "روبي"],
  ["Go", "جو"],
  ["Swift", "سويفت"],
  ["Kotlin", "كوتلن"],
  ["Rust", "رست"],
  ["R", "آر"],
  ["SQL", "إس كيو إل"],
  ["NoSQL", "نو إس كيو إل"],
  ["MongoDB", "مونجو دي بي"],
  ["PostgreSQL", "بوستجري إس كيو إل"],
  ["MySQL", "ماي إس كيو إل"],
  ["React", "رياكت"],
  ["Angular", "أنجولار"],
  ["Vue.js", "فيو جي إس"],
  ["Next.js", "نكست جي إس"],
  ["Node.js", "نود جي إس"],
  ["Express.js", "إكسبرس جي إس"],
  ["Django", "جانجو"],
  ["Flask", "فلاسك"],
  ["Spring Boot", "سبرينج بوت"],
  [".NET", "دوت نت"],
  ["Docker", "دوكر"],
  ["Kubernetes", "كوبرنيتيز"],
  ["AWS", "أمازون ويب سيرفيسز"],
  ["Azure", "أزور"],
  ["Google Cloud Platform", "جوجل كلاود"],
  ["DevOps", "ديف أوبس"],
  ["CI/CD", "التكامل والنشر المستمر"],
  ["Git", "جيت"],
  ["Linux", "لينكس"],
  ["Terraform", "تيرافورم"],
  ["Machine Learning", "تعلم الآلة"],
  ["Deep Learning", "تعلم عميق"],
  ["Natural Language Processing", "معالجة اللغات الطبيعية"],
  ["Computer Vision", "رؤية حاسوبية"],
  ["Data Analysis", "تحليل البيانات"],
  ["Data Engineering", "هندسة البيانات"],
  ["Power BI", "باور بي آي"],
  ["Tableau", "تابلو"],
  ["Excel", "إكسل"],
  ["SAP", "ساب"],
  ["Salesforce", "سيلزفورس"],
  ["Blockchain", "بلوكتشين"],
  ["Cybersecurity", "أمن سيبراني"],
  ["UI/UX Design", "تصميم واجهات المستخدم"],
  ["Figma", "فيجما"],
  ["Adobe Creative Suite", "أدوبي كرييتف سويت"],
  ["Photoshop", "فوتوشوب"],
  ["AutoCAD", "أوتوكاد"],
  ["SolidWorks", "سوليدووركس"],
  // ── Business & Soft Skills ──
  ["Project Management", "إدارة المشاريع"],
  ["Agile / Scrum", "أجايل / سكرم"],
  ["Product Management", "إدارة المنتجات"],
  ["Business Analysis", "تحليل الأعمال"],
  ["Financial Analysis", "تحليل مالي"],
  ["Accounting", "محاسبة"],
  ["Auditing", "تدقيق"],
  ["Budgeting", "إعداد الميزانيات"],
  ["Human Resources", "موارد بشرية"],
  ["Recruitment", "توظيف"],
  ["Training & Development", "تدريب وتطوير"],
  ["Sales", "مبيعات"],
  ["Marketing", "تسويق"],
  ["Digital Marketing", "تسويق رقمي"],
  ["SEO / SEM", "تحسين محركات البحث"],
  ["Social Media Marketing", "تسويق عبر وسائل التواصل"],
  ["Content Writing", "كتابة المحتوى"],
  ["Copywriting", "كتابة إعلانية"],
  ["Public Relations", "علاقات عامة"],
  ["Customer Service", "خدمة العملاء"],
  ["Supply Chain Management", "إدارة سلسلة التوريد"],
  ["Logistics", "لوجستيات"],
  ["Quality Assurance", "ضمان الجودة"],
  ["Risk Management", "إدارة المخاطر"],
  ["Strategic Planning", "تخطيط استراتيجي"],
  ["Leadership", "قيادة"],
  ["Communication Skills", "مهارات التواصل"],
  ["Team Management", "إدارة الفرق"],
  ["Negotiation", "تفاوض"],
  ["Problem Solving", "حل المشكلات"],
  ["Critical Thinking", "تفكير نقدي"],
  ["Time Management", "إدارة الوقت"],
  ["Presentation Skills", "مهارات العرض"],
  ["Microsoft Office", "مايكروسوفت أوفيس"],
  ["ERP Systems", "أنظمة تخطيط الموارد"],
  ["CRM", "إدارة علاقات العملاء"],
  ["Research", "بحث"],
  ["Legal", "قانوني"],
  ["Compliance", "امتثال"],
  ["Healthcare Management", "إدارة الرعاية الصحية"],
  ["Nursing", "تمريض"],
  ["Teaching", "تعليم"],
  ["Translation", "ترجمة"],
  ["Event Management", "إدارة الفعاليات"],
  ["Real Estate", "عقارات"],
  ["Architecture", "هندسة معمارية"],
  ["Mechanical Engineering", "هندسة ميكانيكية"],
  ["Electrical Engineering", "هندسة كهربائية"],
  ["Civil Engineering", "هندسة مدنية"],
];

const JOB_EXPERIENCE = [
  ["Fresh / No Experience", "حديث التخرج / بدون خبرة"],
  ["Less than 1 Year", "أقل من سنة"],
  ["1-2 Years", "١-٢ سنوات"],
  ["2-5 Years", "٢-٥ سنوات"],
  ["5-10 Years", "٥-١٠ سنوات"],
  ["10-15 Years", "١٠-١٥ سنة"],
  ["15-20 Years", "١٥-٢٠ سنة"],
  ["20+ Years", "أكثر من ٢٠ سنة"],
];

const INDUSTRIES = [
  ["Accounting/Taxation", "المحاسبة/الضرائب"],
  ["Advertising/PR", "الإعلان/العلاقات العامة"],
  ["Agriculture/Fertilizer/Pesticide", "الزراعة/الأسمدة/المبيدات"],
  ["Apparel/Clothing", "الملابس/الأزياء"],
  ["Architecture/Interior Design", "العمارة/التصميم الداخلي"],
  ["Arts / Entertainment", "الفنون / الترفيه"],
  ["AutoMobile", "السيارات"],
  ["Aviation", "الطيران"],
  ["Banking/Financial Services", "البنوك/الخدمات المالية"],
  ["BPO", "إسناد العمليات التجارية"],
  ["Broadcasting", "البث الإعلامي"],
  ["Chemicals", "الكيماويات"],
  ["Construction/Engineering/Cement", "البناء/الهندسة/الأسمنت"],
  ["Consultancy", "الاستشارات"],
  ["Consumer Goods/FMCG", "السلع الاستهلاكية"],
  ["Defense/Military", "الدفاع/العسكري"],
  ["Distribution & Logistics", "التوزيع والخدمات اللوجستية"],
  ["E-Commerce/Online", "التجارة الإلكترونية"],
  ["Education/Training", "التعليم/التدريب"],
  ["Electrical/Electronics", "الكهرباء/الإلكترونيات"],
  ["Energy/Oil & Gas", "الطاقة/النفط والغاز"],
  ["Engineering", "الهندسة"],
  ["Environment", "البيئة"],
  ["Event Management", "إدارة الفعاليات"],
  ["Fashion", "الأزياء"],
  ["Fertilizers/Pesticides", "الأسمدة/المبيدات"],
  ["Food & Beverages", "الأغذية والمشروبات"],
  ["Freight Forwarding", "الشحن والتخليص"],
  ["Government/Semi-Government", "الحكومة/شبه الحكومي"],
  ["Healthcare/Hospitals", "الرعاية الصحية/المستشفيات"],
  ["Hospitality/Hotels/Restaurants", "الضيافة/الفنادق/المطاعم"],
  ["Human Resources/Recruitment", "الموارد البشرية/التوظيف"],
  ["Import/Export", "الاستيراد/التصدير"],
  ["Information Technology", "تكنولوجيا المعلومات"],
  ["Insurance", "التأمين"],
  ["Investment Banking", "الخدمات المصرفية الاستثمارية"],
  ["Legal", "القانون"],
  ["Manufacturing", "التصنيع"],
  ["Marine/Shipping", "البحرية/الشحن"],
  ["Media/Communications", "الإعلام/الاتصالات"],
  ["Mining/Metals", "التعدين/المعادن"],
  ["NGO/Social Services", "المنظمات غير الحكومية"],
  ["Packaging", "التعبئة والتغليف"],
  ["Paper & Board", "الورق والكرتون"],
  ["Pharmaceuticals", "الأدوية"],
  ["Power/Energy", "الطاقة/الكهرباء"],
  ["Printing/Publishing", "الطباعة/النشر"],
  ["Real Estate/Property", "العقارات"],
  ["Retail", "التجزئة"],
  ["Security", "الأمن"],
  ["Sports/Fitness", "الرياضة/اللياقة"],
  ["Telecom/ISP", "الاتصالات"],
  ["Textiles/Garments", "النسيج/الملابس"],
  ["Tobacco", "التبغ"],
  ["Tourism/Travel", "السياحة/السفر"],
  ["Trading", "التجارة"],
  ["Transportation", "النقل"],
  ["Waste Management", "إدارة النفايات"],
];

const GENDERS = [
  ["Male", "ذكر"],
  ["Female", "أنثى"],
  ["Other", "آخر"],
  ["Prefer Not to Say", "أفضل عدم الإفصاح"],
];

const FUNCTIONAL_AREAS = [
  ["Accountant", "محاسب"],
  ["Accounts, Finance & Financial Services", "الحسابات والمالية والخدمات المالية"],
  ["Administration", "الإدارة"],
  ["Advertising", "الإعلان"],
  ["Architects & Construction", "المعماريون والبناء"],
  ["Architecture", "العمارة"],
  ["Automotive", "السيارات"],
  ["Bank Operation", "العمليات المصرفية"],
  ["Billing", "الفوترة"],
  ["Business Development", "تطوير الأعمال"],
  ["Business Management", "إدارة الأعمال"],
  ["Call Center", "مركز الاتصال"],
  ["Client Services", "خدمات العملاء"],
  ["Communications", "الاتصالات"],
  ["Consulting", "الاستشارات"],
  ["Content Writing", "كتابة المحتوى"],
  ["Corporate Affairs", "شؤون الشركات"],
  ["Corporate Planning", "التخطيط المؤسسي"],
  ["Creative Design", "التصميم الإبداعي"],
  ["Customer Service", "خدمة العملاء"],
  ["Data Entry", "إدخال البيانات"],
  ["Data Science", "علم البيانات"],
  ["Digital Marketing", "التسويق الرقمي"],
  ["Distribution & Logistics", "التوزيع والخدمات اللوجستية"],
  ["Education & Training", "التعليم والتدريب"],
  ["Electrical Engineering", "الهندسة الكهربائية"],
  ["Engineering", "الهندسة"],
  ["Environment & Health", "البيئة والصحة"],
  ["Executive Management", "الإدارة التنفيذية"],
  ["Export/Import", "التصدير/الاستيراد"],
  ["Facility Management", "إدارة المرافق"],
  ["Fashion Design", "تصميم الأزياء"],
  ["Finance", "المالية"],
  ["Food & Beverage", "الأغذية والمشروبات"],
  ["Front Desk / Receptionist", "الاستقبال"],
  ["General Management", "الإدارة العامة"],
  ["Graphic Design", "التصميم الجرافيكي"],
  ["Health & Safety", "الصحة والسلامة"],
  ["Healthcare", "الرعاية الصحية"],
  ["Hospitality", "الضيافة"],
  ["Human Resources", "الموارد البشرية"],
  ["Industrial Engineering", "الهندسة الصناعية"],
  ["Information Technology", "تكنولوجيا المعلومات"],
  ["Insurance", "التأمين"],
  ["Interior Design", "التصميم الداخلي"],
  ["Investment", "الاستثمار"],
  ["IT - Hardware", "تكنولوجيا المعلومات - الأجهزة"],
  ["IT - Networking", "تكنولوجيا المعلومات - الشبكات"],
  ["IT - Software Development", "تكنولوجيا المعلومات - تطوير البرمجيات"],
  ["IT Security", "أمن تكنولوجيا المعلومات"],
  ["Journalism", "الصحافة"],
  ["Lab Technician", "فني مختبر"],
  ["Legal", "القانون"],
  ["Library", "المكتبات"],
  ["Maintenance", "الصيانة"],
  ["Management", "الإدارة"],
  ["Manufacturing", "التصنيع"],
  ["Marine", "البحرية"],
  ["Marketing", "التسويق"],
  ["Mechanical Engineering", "الهندسة الميكانيكية"],
  ["Media / Public Relations", "الإعلام / العلاقات العامة"],
  ["Medical", "الطب"],
  ["Mining", "التعدين"],
  ["Nursing", "التمريض"],
  ["Operations", "العمليات"],
  ["Pharmaceutical", "الأدوية"],
  ["Photography", "التصوير"],
  ["Planning", "التخطيط"],
  ["Procurement / Purchasing", "المشتريات"],
  ["Production", "الإنتاج"],
  ["Project Management", "إدارة المشاريع"],
  ["Property / Real Estate", "العقارات"],
  ["Public Relations", "العلاقات العامة"],
  ["Quality Assurance / QC", "ضمان الجودة / مراقبة الجودة"],
  ["Research & Development", "البحث والتطوير"],
  ["Retail", "التجزئة"],
  ["Sales", "المبيعات"],
  ["Sales & Business Development", "المبيعات وتطوير الأعمال"],
  ["Security", "الأمن"],
  ["Social Media", "وسائل التواصل الاجتماعي"],
  ["Software / Web Development", "تطوير البرمجيات / الويب"],
  ["Strategy", "الاستراتيجية"],
  ["Supply Chain", "سلسلة التوريد"],
  ["Teaching", "التدريس"],
  ["Technical Writing", "الكتابة التقنية"],
  ["Telecommunications", "الاتصالات"],
  ["Tourism / Travel", "السياحة / السفر"],
  ["Training", "التدريب"],
  ["Translation", "الترجمة"],
  ["Transportation", "النقل"],
  ["Treasury", "الخزينة"],
  ["Warehousing", "التخزين"],
];

const CAREER_LEVELS = [
  ["Entry Level", "مستوى مبتدئ"],
  ["Junior", "مبتدئ"],
  ["Mid-Level", "متوسط"],
  ["Senior", "أقدم"],
  ["Managerial", "إداري"],
  ["Director", "مدير"],
  ["Executive", "تنفيذي"],
  ["Intern / Student", "متدرب / طالب"],
  ["Department Head", "رئيس قسم"],
  ["GM / CEO / Country Head", "مدير عام / رئيس تنفيذي"],
];

const LANGUAGE_LEVELS = [
  ["Beginner", "مبتدئ"],
  ["Elementary", "أساسي"],
  ["Intermediate", "متوسط"],
  ["Upper Intermediate", "فوق المتوسط"],
  ["Advanced", "متقدم"],
  ["Expert / Native", "خبير / لغة أم"],
];

// ─── Seed runner ──────────────────────────────────────────────────────────────
const ALL_CATEGORIES = [
  { name: "SalaryPeriod", data: SALARY_PERIODS },
  { name: "OwnershipType", data: OWNERSHIP_TYPES },
  { name: "MaritalStatus", data: MARITAL_STATUSES },
  { name: "ResultType", data: RESULT_TYPES },
  { name: "MajorSubject", data: MAJOR_SUBJECTS },
  { name: "DegreeType", data: DEGREE_TYPES },
  { name: "DegreeLevel", data: DEGREE_LEVELS },
  { name: "JobShift", data: JOB_SHIFTS },
  { name: "JobType", data: JOB_TYPES },
  { name: "JobSkill", data: JOB_SKILLS },
  { name: "JobExperience", data: JOB_EXPERIENCE },
  { name: "Industry", data: INDUSTRIES },
  { name: "Gender", data: GENDERS },
  { name: "FunctionalArea", data: FUNCTIONAL_AREAS },
  { name: "CareerLevel", data: CAREER_LEVELS },
  { name: "LanguageLevel", data: LANGUAGE_LEVELS },
];

async function main() {
  console.log("🔌 Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected\n");

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { name, data } of ALL_CATEGORIES) {
    const Model = getModel(name);
    const docs = buildDocs(data);

    try {
      const result = await Model.insertMany(docs, { ordered: false });
      console.log(`✅ ${name}: inserted ${result.length} items`);
      totalInserted += result.length;
    } catch (err) {
      if (err.code === 11000 || err.insertedDocs) {
        // Partial insert — some duplicates were skipped
        const inserted = err.insertedDocs?.length ?? 0;
        const skipped = docs.length - inserted;
        console.log(`⚠️  ${name}: inserted ${inserted}, skipped ${skipped} duplicates`);
        totalInserted += inserted;
        totalSkipped += skipped;
      } else {
        console.error(`❌ ${name}: ${err.message}`);
      }
    }
  }

  console.log(`\n🎉 Seed complete: ${totalInserted} inserted, ${totalSkipped} duplicates skipped`);
  console.log(`\n📊 Category summary:`);
  for (const { name, data } of ALL_CATEGORIES) {
    console.log(`   ${name.padEnd(20)} ${data.length} entries`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Seed failed:", err);
  process.exit(1);
});
