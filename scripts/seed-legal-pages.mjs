/**
 * Seed default legal pages (Privacy Policy, Terms & Conditions, Cookie Policy, GDPR).
 *
 * These pages are managed via the Admin CMS panel at /admin/cms/static-pages.
 * This script creates initial placeholder content that the Super Admin can edit.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-legal-pages.mjs
 *
 * Requires MONGODB_URI env variable.
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

const StaticPageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    titleAr: { type: String, default: "", trim: true },
    body: { type: String, required: true },
    bodyAr: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const StaticPage = mongoose.models.StaticPage || mongoose.model("StaticPage", StaticPageSchema);

const LEGAL_PAGES = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    titleAr: "سياسة الخصوصية",
    body: `<h2>Privacy Policy</h2>
<p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. Introduction</h3>
<p>MPLOYEDIN UK LTD ("MPLOYEDIN", "we", "us", "our") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and share your information when you use our AI-powered recruitment platform.</p>

<h3>2. Data Controller</h3>
<p>MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR, United Kingdom is the data controller for your personal data.</p>

<h3>3. Information We Collect</h3>
<ul>
  <li><strong>Account Information:</strong> Name, email address, phone number, password (hashed).</li>
  <li><strong>Profile Data:</strong> CV/resume, work experience, education, skills, certifications, profile photo.</li>
  <li><strong>Employer Data:</strong> Company name, industry, size, trade license, contact person details.</li>
  <li><strong>Usage Data:</strong> IP address, browser type, device information, pages visited, actions taken.</li>
  <li><strong>Communication Data:</strong> Messages, interview notes, application correspondence.</li>
  <li><strong>AI Processing Data:</strong> Data used for AI matching, candidate screening, and recommendations.</li>
</ul>

<h3>4. How We Use Your Data</h3>
<ul>
  <li>To provide and improve our recruitment platform services.</li>
  <li>To match job seekers with relevant job opportunities using AI.</li>
  <li>To facilitate communication between employers and candidates.</li>
  <li>To process applications and manage the recruitment pipeline.</li>
  <li>To send service notifications and updates.</li>
  <li>To comply with legal obligations.</li>
</ul>

<h3>5. Legal Basis for Processing (GDPR)</h3>
<ul>
  <li><strong>Consent:</strong> For marketing communications and cookie usage.</li>
  <li><strong>Contract:</strong> To provide our recruitment services.</li>
  <li><strong>Legitimate Interest:</strong> For platform improvement and fraud prevention.</li>
  <li><strong>Legal Obligation:</strong> To comply with applicable laws.</li>
</ul>

<h3>6. Data Sharing</h3>
<p>We do not sell your personal data. We may share data with:</p>
<ul>
  <li>Employers (when you apply for jobs or your profile is matched).</li>
  <li>Service providers (hosting, analytics, AI processing).</li>
  <li>Legal authorities (when required by law).</li>
</ul>

<h3>7. Data Retention</h3>
<p>We retain your data for as long as your account is active or as needed to provide services. Specific retention periods are outlined in our GDPR policy.</p>

<h3>8. Your Rights</h3>
<p>Under GDPR and applicable data protection laws, you have the right to:</p>
<ul>
  <li>Access your personal data</li>
  <li>Rectify inaccurate data</li>
  <li>Request data erasure ("right to be forgotten")</li>
  <li>Restrict processing</li>
  <li>Data portability</li>
  <li>Object to processing</li>
  <li>Withdraw consent</li>
</ul>

<h3>9. Data Security</h3>
<p>We implement appropriate technical and organizational measures to protect your data, including encryption, access controls, and regular security assessments.</p>

<h3>10. Contact Us</h3>
<p>For privacy-related inquiries, contact us at: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,

    bodyAr: `<h2>سياسة الخصوصية</h2>
<p><strong>آخر تحديث:</strong> ${new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. المقدمة</h3>
<p>شركة مبلويدين المملكة المتحدة المحدودة ("مبلويدين"، "نحن"، "لنا") ملتزمة بحماية بياناتك الشخصية. توضح سياسة الخصوصية هذه كيف نجمع ونستخدم ونخزن ونشارك معلوماتك عند استخدام منصة التوظيف المدعومة بالذكاء الاصطناعي.</p>

<h3>2. المسؤول عن البيانات</h3>
<p>شركة مبلويدين المملكة المتحدة المحدودة، X2 Greenleaf Walk, Southall, UB1 1FR، المملكة المتحدة هي المسؤولة عن بياناتك الشخصية.</p>

<h3>3. المعلومات التي نجمعها</h3>
<ul>
  <li><strong>معلومات الحساب:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، كلمة المرور (مشفرة).</li>
  <li><strong>بيانات الملف الشخصي:</strong> السيرة الذاتية، الخبرة العملية، التعليم، المهارات، الشهادات.</li>
  <li><strong>بيانات صاحب العمل:</strong> اسم الشركة، القطاع، الحجم، الرخصة التجارية.</li>
  <li><strong>بيانات الاستخدام:</strong> عنوان IP، نوع المتصفح، معلومات الجهاز.</li>
  <li><strong>بيانات الاتصال:</strong> الرسائل، ملاحظات المقابلات، المراسلات.</li>
</ul>

<h3>4. حقوقك</h3>
<p>بموجب اللائحة العامة لحماية البيانات (GDPR)، لديك الحق في الوصول إلى بياناتك وتصحيحها وحذفها وتقييد معالجتها ونقلها.</p>

<h3>5. اتصل بنا</h3>
<p>للاستفسارات المتعلقة بالخصوصية: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,
  },
  {
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    titleAr: "الشروط والأحكام",
    body: `<h2>Terms & Conditions</h2>
<p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. Acceptance of Terms</h3>
<p>By accessing or using the MPLOYEDIN platform ("Service"), you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Service.</p>

<h3>2. Definitions</h3>
<ul>
  <li><strong>"Platform"</strong> — the MPLOYEDIN website and all related services.</li>
  <li><strong>"User"</strong> — any person or entity using the Platform (Job Seekers, Employers, Agents).</li>
  <li><strong>"Job Seeker"</strong> — an individual searching for employment opportunities.</li>
  <li><strong>"Employer"</strong> — a company or individual posting job opportunities.</li>
</ul>

<h3>3. Eligibility</h3>
<p>You must be at least 18 years old to use the Platform. By registering, you represent that you meet this requirement.</p>

<h3>4. User Accounts</h3>
<ul>
  <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
  <li>You agree to provide accurate, current, and complete information.</li>
  <li>One person or entity may not maintain multiple accounts of the same type.</li>
  <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
</ul>

<h3>5. Job Seeker Obligations</h3>
<ul>
  <li>Provide truthful and accurate information in your profile and applications.</li>
  <li>Do not misrepresent your qualifications, experience, or identity.</li>
  <li>Respect the confidentiality of employer information shared during the recruitment process.</li>
</ul>

<h3>6. Employer Obligations</h3>
<ul>
  <li>Post only genuine, lawful job opportunities.</li>
  <li>Do not discriminate based on race, gender, religion, nationality, or any protected characteristic.</li>
  <li>Provide accurate company information and job descriptions.</li>
  <li>Comply with all applicable labor and employment laws.</li>
</ul>

<h3>7. Prohibited Conduct</h3>
<ul>
  <li>Using the Platform for any unlawful purpose.</li>
  <li>Scraping, crawling, or automated data extraction without permission.</li>
  <li>Uploading malicious content, viruses, or harmful code.</li>
  <li>Harassment, abuse, or threatening behavior toward other users.</li>
  <li>Impersonating another person or entity.</li>
</ul>

<h3>8. Intellectual Property</h3>
<p>All content, design, and technology on the Platform are owned by MPLOYEDIN UK LTD. You may not copy, modify, or distribute any part of the Platform without written permission.</p>

<h3>9. AI-Powered Features</h3>
<p>Our Platform uses AI for job matching, candidate screening, and recommendations. While we strive for accuracy, AI-generated results are suggestions and should not be the sole basis for hiring decisions.</p>

<h3>10. Limitation of Liability</h3>
<p>MPLOYEDIN is not responsible for:</p>
<ul>
  <li>The accuracy of information provided by other users.</li>
  <li>Employment outcomes or hiring decisions.</li>
  <li>Third-party actions or content.</li>
  <li>Temporary service interruptions or data loss.</li>
</ul>

<h3>11. Termination</h3>
<p>We may suspend or terminate your access at any time for violation of these terms. You may delete your account at any time through your settings.</p>

<h3>12. Governing Law</h3>
<p>These Terms are governed by the laws of England and Wales. Any disputes shall be resolved in the courts of England.</p>

<h3>13. Changes to Terms</h3>
<p>We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance of the updated Terms.</p>

<h3>14. Contact</h3>
<p>For questions about these Terms: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,

    bodyAr: `<h2>الشروط والأحكام</h2>
<p><strong>آخر تحديث:</strong> ${new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. قبول الشروط</h3>
<p>باستخدام منصة مبلويدين ("الخدمة")، فإنك توافق على الالتزام بهذه الشروط والأحكام.</p>

<h3>2. الأهلية</h3>
<p>يجب أن يكون عمرك 18 عامًا على الأقل لاستخدام المنصة.</p>

<h3>3. حسابات المستخدمين</h3>
<ul>
  <li>أنت مسؤول عن الحفاظ على سرية بيانات حسابك.</li>
  <li>توافق على تقديم معلومات دقيقة وحديثة وكاملة.</li>
  <li>نحتفظ بالحق في تعليق أو إنهاء الحسابات المخالفة.</li>
</ul>

<h3>4. السلوك المحظور</h3>
<ul>
  <li>استخدام المنصة لأي غرض غير قانوني.</li>
  <li>انتحال شخصية شخص أو كيان آخر.</li>
  <li>تحميل محتوى ضار أو فيروسات.</li>
</ul>

<h3>5. القانون الحاكم</h3>
<p>تخضع هذه الشروط لقوانين إنجلترا وويلز.</p>

<h3>6. اتصل بنا</h3>
<p>للأسئلة حول هذه الشروط: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    titleAr: "سياسة ملفات تعريف الارتباط",
    body: `<h2>Cookie Policy</h2>
<p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. What Are Cookies?</h3>
<p>Cookies are small text files placed on your device when you visit our website. They help us provide a better experience and understand how you use our Platform.</p>

<h3>2. Cookies We Use</h3>
<table>
  <thead><tr><th>Cookie Type</th><th>Purpose</th><th>Duration</th></tr></thead>
  <tbody>
    <tr><td><strong>Essential</strong></td><td>Authentication, security, session management</td><td>Session / 30 days</td></tr>
    <tr><td><strong>Functional</strong></td><td>Language preferences, UI settings</td><td>1 year</td></tr>
    <tr><td><strong>Analytics</strong></td><td>Usage statistics, performance monitoring</td><td>2 years</td></tr>
  </tbody>
</table>

<h3>3. Essential Cookies</h3>
<p>These are strictly necessary for the Platform to function. They include:</p>
<ul>
  <li><code>next-auth.session-token</code> — Authentication session</li>
  <li><code>cookie-consent</code> — Your cookie preference choice</li>
  <li><code>locale</code> — Language preference (en/ar)</li>
</ul>

<h3>4. Managing Cookies</h3>
<p>You can control cookies through your browser settings. Note that disabling essential cookies may prevent the Platform from functioning correctly.</p>

<h3>5. Third-Party Cookies</h3>
<p>We may use third-party services (e.g., analytics providers) that set their own cookies. We do not control these cookies.</p>

<h3>6. Contact</h3>
<p>For questions about cookies: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,

    bodyAr: `<h2>سياسة ملفات تعريف الارتباط</h2>
<p><strong>آخر تحديث:</strong> ${new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. ما هي ملفات تعريف الارتباط؟</h3>
<p>ملفات تعريف الارتباط هي ملفات نصية صغيرة توضع على جهازك عند زيارة موقعنا.</p>

<h3>2. أنواع ملفات تعريف الارتباط</h3>
<ul>
  <li><strong>أساسية:</strong> المصادقة والأمان وإدارة الجلسة.</li>
  <li><strong>وظيفية:</strong> تفضيلات اللغة وإعدادات الواجهة.</li>
  <li><strong>تحليلية:</strong> إحصاءات الاستخدام ومراقبة الأداء.</li>
</ul>

<h3>3. إدارة ملفات تعريف الارتباط</h3>
<p>يمكنك التحكم في ملفات تعريف الارتباط من خلال إعدادات المتصفح.</p>

<h3>4. اتصل بنا</h3>
<p>للاستفسارات: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,
  },
  {
    slug: "gdpr",
    title: "GDPR & Data Protection",
    titleAr: "حماية البيانات (GDPR)",
    body: `<h2>GDPR & Data Protection</h2>
<p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. Our Commitment</h3>
<p>MPLOYEDIN UK LTD is committed to complying with the General Data Protection Regulation (GDPR) and the UK Data Protection Act 2018. We process personal data lawfully, fairly, and transparently.</p>

<h3>2. Your Rights Under GDPR</h3>
<p>As a data subject, you have the following rights:</p>

<h4>Right of Access (Article 15)</h4>
<p>You can request a copy of all personal data we hold about you. We will respond within 30 days.</p>

<h4>Right to Rectification (Article 16)</h4>
<p>You can request correction of inaccurate personal data. You can also update your profile directly through the Platform.</p>

<h4>Right to Erasure (Article 17)</h4>
<p>You can request deletion of your personal data ("right to be forgotten"). We will comply unless we have a legal obligation to retain it.</p>

<h4>Right to Restrict Processing (Article 18)</h4>
<p>You can request that we limit how we process your data in certain circumstances.</p>

<h4>Right to Data Portability (Article 20)</h4>
<p>You can request your data in a structured, commonly used, machine-readable format.</p>

<h4>Right to Object (Article 21)</h4>
<p>You can object to processing based on legitimate interests or direct marketing.</p>

<h3>3. How to Exercise Your Rights</h3>
<p>To exercise any of your GDPR rights, you can:</p>
<ul>
  <li>Email us at: <a href="mailto:support@mployedin.com">support@mployedin.com</a></li>
  <li>Use the data export/deletion features in your account settings.</li>
</ul>
<p>We will verify your identity before processing any request and respond within 30 days.</p>

<h3>4. Data Processing Activities</h3>
<table>
  <thead><tr><th>Category</th><th>Purpose</th><th>Legal Basis</th><th>Retention</th></tr></thead>
  <tbody>
    <tr><td>Account Data</td><td>Service provision</td><td>Contract</td><td>Duration of account + 3 years</td></tr>
    <tr><td>Application Data</td><td>Recruitment process</td><td>Contract</td><td>2 years after last activity</td></tr>
    <tr><td>CV/Resume</td><td>Job matching</td><td>Consent</td><td>2 years or until withdrawn</td></tr>
    <tr><td>Usage Analytics</td><td>Platform improvement</td><td>Legitimate Interest</td><td>2 years</td></tr>
    <tr><td>Communication</td><td>Recruitment correspondence</td><td>Contract</td><td>1 year</td></tr>
    <tr><td>Audit Logs</td><td>Security & compliance</td><td>Legal Obligation</td><td>5 years</td></tr>
  </tbody>
</table>

<h3>5. International Data Transfers</h3>
<p>Your data may be processed in servers located outside the UK/EEA. We ensure adequate safeguards (e.g., Standard Contractual Clauses) are in place.</p>

<h3>6. Data Breach Notification</h3>
<p>In the event of a data breach that poses a risk to your rights, we will notify the relevant supervisory authority within 72 hours and inform affected users without undue delay.</p>

<h3>7. Data Protection Officer</h3>
<p>For data protection inquiries, contact us at:</p>
<p>Email: <a href="mailto:support@mployedin.com">support@mployedin.com</a><br/>
Address: MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR, United Kingdom</p>

<h3>8. Supervisory Authority</h3>
<p>You have the right to lodge a complaint with the Information Commissioner's Office (ICO):</p>
<p>Website: <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a><br/>
Phone: 0303 123 1113</p>`,

    bodyAr: `<h2>حماية البيانات (GDPR)</h2>
<p><strong>آخر تحديث:</strong> ${new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" })}</p>

<h3>1. التزامنا</h3>
<p>شركة مبلويدين المملكة المتحدة المحدودة ملتزمة بالامتثال للائحة العامة لحماية البيانات (GDPR) وقانون حماية البيانات في المملكة المتحدة 2018.</p>

<h3>2. حقوقك بموجب GDPR</h3>
<h4>حق الوصول</h4>
<p>يمكنك طلب نسخة من جميع البيانات الشخصية التي نحتفظ بها عنك.</p>

<h4>حق التصحيح</h4>
<p>يمكنك طلب تصحيح البيانات الشخصية غير الدقيقة.</p>

<h4>حق الحذف</h4>
<p>يمكنك طلب حذف بياناتك الشخصية ("الحق في النسيان").</p>

<h4>حق تقييد المعالجة</h4>
<p>يمكنك طلب تقييد كيفية معالجة بياناتك.</p>

<h4>حق نقل البيانات</h4>
<p>يمكنك طلب بياناتك بتنسيق منظم وقابل للقراءة آليًا.</p>

<h3>3. كيفية ممارسة حقوقك</h3>
<p>لممارسة أي من حقوقك، يمكنك:</p>
<ul>
  <li>مراسلتنا على: <a href="mailto:support@mployedin.com">support@mployedin.com</a></li>
  <li>استخدام ميزات تصدير/حذف البيانات في إعدادات حسابك.</li>
</ul>

<h3>4. الإبلاغ عن خرق البيانات</h3>
<p>في حالة حدوث خرق للبيانات يشكل خطرًا على حقوقك، سنقوم بإخطار الجهة الرقابية المختصة خلال 72 ساعة.</p>

<h3>5. اتصل بنا</h3>
<p>البريد الإلكتروني: <a href="mailto:support@mployedin.com">support@mployedin.com</a></p>`,
  },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  for (const page of LEGAL_PAGES) {
    const exists = await StaticPage.findOne({ slug: page.slug });
    if (exists) {
      console.log(`  ⏭  "${page.slug}" already exists — skipping`);
      continue;
    }
    await StaticPage.create(page);
    console.log(`  ✅ Created "${page.slug}"`);
  }

  console.log("\nDone! Legal pages seeded.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
