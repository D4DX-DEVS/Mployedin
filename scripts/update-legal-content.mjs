/**
 * Update privacy-policy and cookie-policy pages with official content from mployedin.com.
 *
 * Usage:
 *   node --env-file=.env scripts/update-legal-content.mjs
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

// ─── Privacy Policy ─────────────────────────────────────────────────────────

const PRIVACY_BODY = `<h2>1. Information We Collect</h2>

<h3>1.1 Personal Data</h3>
<p>We collect and process the following types of personal data when you use our website:</p>
<ul>
  <li><strong>Contact Information:</strong> Name, email address, phone number, and postal address.</li>
  <li><strong>Professional Information:</strong> Job title, employment history, education, and skills.</li>
  <li><strong>User Account Information:</strong> Username, password, and profile information.</li>
  <li><strong>CVs/Resumes and Cover Letters:</strong> Information contained in the documents you upload or submit to our Website.</li>
  <li><strong>Communication Data:</strong> Information you provide when contacting us, such as inquiries or feedback.</li>
</ul>

<h3>1.2 Automatically Collected Information</h3>
<p>When you access or use our website, we automatically collect certain information about your device, browsing actions, and usage patterns. This information may include your IP address, browser type, operating system, referring URLs, pages visited, and the duration and timestamp of your visits.</p>

<h2>2. Use of Personal Data</h2>
<p>We use the personal data we collect for the following purposes:</p>
<ul>
  <li><strong>Facilitating Job Searches:</strong> Matching job seekers with relevant job listings based on their qualifications, skills, and preferences.</li>
  <li><strong>Recruitment Services:</strong> Assisting employers in finding suitable candidates for their job openings.</li>
  <li><strong>Communication:</strong> Responding to inquiries, providing support, and sending important notices related to our services.</li>
  <li><strong>Improving and Personalizing User Experience:</strong> Analyzing usage patterns, conducting research, and enhancing our services, content, and features.</li>
  <li><strong>Legal Compliance:</strong> Complying with legal obligations and enforcing our terms and conditions.</li>
</ul>

<h2>3. Legal Basis for Processing</h2>
<p>We rely on the following legal bases for processing personal data:</p>
<ul>
  <li><strong>Performance of a Contract:</strong> Processing personal data to fulfill our contractual obligations, such as providing job search and recruitment services.</li>
  <li><strong>Legitimate Interests:</strong> Processing personal data based on our legitimate interests, such as improving our services, preventing fraud, and ensuring the security of our Website.</li>
  <li><strong>Consent:</strong> Obtaining your consent before processing personal data for specific purposes, such as sending promotional communications or sharing data with third parties.</li>
</ul>

<h2>4. Sharing of Personal Data</h2>
<p>We may share personal data with the following parties:</p>
<ul>
  <li><strong>Employers and Job Seekers:</strong> Sharing personal data between employers and job seekers as part of the recruitment process.</li>
  <li><strong>Service Providers:</strong> Engaging third-party service providers who assist us in operating our Website and providing our services, subject to appropriate data protection agreements.</li>
  <li><strong>Legal Requirements:</strong> Disclosing personal data if required by law or in response to valid requests from public authorities.</li>
  <li><strong>Business Transfers:</strong> Sharing personal data in connection with a merger, acquisition, or sale of all or a portion of our business assets.</li>
</ul>

<h2>5. International Data Transfers</h2>
<p>We may transfer personal data to countries outside the United Kingdom or the European Economic Area (EEA). In such cases, we will ensure appropriate safeguards are in place to protect your personal data, such as using standard contractual clauses approved by the European Commission.</p>

<h2>6. Data Retention</h2>
<p>We retain personal data for as long as necessary to fulfill the purposes outlined in this Privacy Policy, or as required by law. The retention period may vary depending on the type of data.</p>

<h2>7. Consent Forms</h2>

<h3>7.1 Purpose of Consent</h3>
<p>We may collect and process personal data for various purposes, such as providing our job portal services, improving the user experience, and complying with legal obligations. We obtain consent from individuals before processing their personal data, except where another legal basis for processing applies.</p>

<h3>7.2 Voluntary Nature of Consent</h3>
<p>Consent is voluntary, and individuals have the right to refuse or withdraw consent at any time without any negative consequences. However, please note that withdrawing consent may affect our ability to provide certain services.</p>

<h3>7.3 Informed Consent</h3>
<p>We ensure that individuals provide informed consent by providing clear and concise information about the purposes and methods of data processing, the categories of personal data collected, and any third parties with whom the data may be shared.</p>

<h3>7.4 Obtaining Consent</h3>
<p>We obtain consent through explicit actions, such as ticking a box or clicking a button, that clearly indicate the individual&rsquo;s agreement to the processing of their personal data. We do not use pre-ticked boxes or assume consent from silence or inactivity.</p>

<h3>7.5 Revoking Consent</h3>
<p>Individuals have the right to revoke their consent at any time by contacting us using the information provided below. We will promptly act upon any revocation request and cease the processing of personal data, except where another legal basis for processing applies.</p>

<h2>8. Consent for Direct Marketing</h2>

<h3>8.1 Direct Marketing Communications</h3>
<p>We may send direct marketing communications, such as newsletters or promotional offers, to individuals who have provided their consent. Direct marketing communications will be tailored to the individual&rsquo;s preferences, and individuals can choose the types of communications they wish to receive.</p>

<h3>8.2 Opt-out Mechanism</h3>
<p>We provide an easy and accessible opt-out mechanism in every direct marketing communication. Individuals can unsubscribe from receiving further marketing communications by following the instructions provided or by contacting us.</p>

<h2>9. Data Breach Response Plan</h2>

<h3>9.1 Detection and Initial Assessment</h3>
<p>Any employee who suspects or becomes aware of a potential data breach must immediately report it to the designated Data Protection Officer (DPO) or the relevant department responsible for data protection.</p>

<h3>9.2 Investigation and Assessment</h3>
<p>Upon receiving a report of a potential data breach, the DPO or the designated team will promptly investigate the incident to assess the nature, scope, and severity of the breach.</p>

<h3>9.3 Notification Obligations</h3>
<p>If the data breach is likely to result in a risk to the rights and freedoms of individuals, we will notify the relevant supervisory authority, the Information Commissioner&rsquo;s Office (ICO), without undue delay and, where feasible, within 72 hours of becoming aware of the breach.</p>

<h3>9.4 Communication with Affected Individuals</h3>
<p>In cases where the data breach is likely to result in a high risk to the rights and freedoms of individuals, we will also communicate directly with the affected individuals, providing clear and timely information about the breach, the potential risks, and any recommended actions they should take.</p>

<h2>10. Data Subject Rights</h2>
<p>As a data subject, you have the following rights:</p>
<ul>
  <li><strong>Right to Access:</strong> You can request access to the personal data we hold about you.</li>
  <li><strong>Right to Rectification:</strong> You can request the correction or updating of your personal data.</li>
  <li><strong>Right to Erasure:</strong> Under certain circumstances, you can request the erasure of your personal data.</li>
  <li><strong>Right to Restriction of Processing:</strong> You can request the restriction of the processing of your personal data.</li>
  <li><strong>Right to Data Portability:</strong> You can receive your personal data in a structured, commonly used, machine-readable format.</li>
  <li><strong>Right to Object:</strong> You can object to the processing of your personal data for direct marketing or legitimate interests.</li>
  <li><strong>Right to Withdraw Consent:</strong> If we rely on your consent, you can withdraw it at any time.</li>
</ul>

<h2>11. Exercising Your Data Subject Rights</h2>
<p>To exercise your data subject rights, please submit a written request to us using the contact details provided below. We will respond to your request without undue delay and within one month, unless an extension is permitted under applicable law.</p>`;

const PRIVACY_BODY_AR = `<h2>1. المعلومات التي نجمعها</h2>

<h3>1.1 البيانات الشخصية</h3>
<p>نقوم بجمع ومعالجة الأنواع التالية من البيانات الشخصية عند استخدامك لموقعنا:</p>
<ul>
  <li><strong>معلومات الاتصال:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، والعنوان البريدي.</li>
  <li><strong>المعلومات المهنية:</strong> المسمى الوظيفي، التاريخ الوظيفي، التعليم، والمهارات.</li>
  <li><strong>معلومات حساب المستخدم:</strong> اسم المستخدم، كلمة المرور، ومعلومات الملف الشخصي.</li>
  <li><strong>السير الذاتية ورسائل التغطية:</strong> المعلومات الواردة في المستندات التي تقوم بتحميلها.</li>
  <li><strong>بيانات الاتصال:</strong> المعلومات التي تقدمها عند التواصل معنا.</li>
</ul>

<h3>1.2 المعلومات المجمعة تلقائياً</h3>
<p>عند وصولك إلى موقعنا أو استخدامه، نقوم تلقائياً بجمع معلومات معينة حول جهازك وأنماط الاستخدام، بما في ذلك عنوان IP ونوع المتصفح ونظام التشغيل والصفحات التي تمت زيارتها.</p>

<h2>2. استخدام البيانات الشخصية</h2>
<p>نستخدم البيانات الشخصية التي نجمعها للأغراض التالية:</p>
<ul>
  <li><strong>تسهيل البحث عن وظائف:</strong> مطابقة الباحثين عن عمل مع قوائم الوظائف ذات الصلة.</li>
  <li><strong>خدمات التوظيف:</strong> مساعدة أصحاب العمل في إيجاد المرشحين المناسبين.</li>
  <li><strong>الاتصال:</strong> الرد على الاستفسارات وتقديم الدعم.</li>
  <li><strong>تحسين تجربة المستخدم:</strong> تحليل أنماط الاستخدام وتحسين خدماتنا.</li>
  <li><strong>الامتثال القانوني:</strong> الامتثال للالتزامات القانونية.</li>
</ul>

<h2>3. الأساس القانوني للمعالجة</h2>
<p>نعتمد على الأسس القانونية التالية لمعالجة البيانات الشخصية:</p>
<ul>
  <li><strong>تنفيذ العقد:</strong> معالجة البيانات لتقديم خدمات البحث عن وظائف والتوظيف.</li>
  <li><strong>المصالح المشروعة:</strong> تحسين خدماتنا ومنع الاحتيال وضمان أمان الموقع.</li>
  <li><strong>الموافقة:</strong> الحصول على موافقتك قبل معالجة البيانات لأغراض محددة.</li>
</ul>

<h2>4. مشاركة البيانات الشخصية</h2>
<p>قد نشارك البيانات الشخصية مع:</p>
<ul>
  <li><strong>أصحاب العمل والباحثين عن عمل:</strong> كجزء من عملية التوظيف.</li>
  <li><strong>مقدمي الخدمات:</strong> الذين يساعدوننا في تشغيل الموقع.</li>
  <li><strong>المتطلبات القانونية:</strong> إذا كان ذلك مطلوباً بموجب القانون.</li>
  <li><strong>نقل الأعمال:</strong> في حالة الاندماج أو الاستحواذ.</li>
</ul>

<h2>5. نقل البيانات الدولي</h2>
<p>قد ننقل البيانات الشخصية إلى دول خارج المملكة المتحدة أو المنطقة الاقتصادية الأوروبية مع ضمان وجود ضمانات مناسبة لحماية بياناتك.</p>

<h2>6. الاحتفاظ بالبيانات</h2>
<p>نحتفظ بالبيانات الشخصية طالما كان ذلك ضرورياً لتحقيق الأغراض المبينة في سياسة الخصوصية هذه أو وفقاً لما يقتضيه القانون.</p>

<h2>7. حقوق أصحاب البيانات</h2>
<p>بصفتك صاحب بيانات، لديك الحقوق التالية:</p>
<ul>
  <li><strong>حق الوصول:</strong> طلب نسخة من بياناتك الشخصية.</li>
  <li><strong>حق التصحيح:</strong> طلب تصحيح بياناتك غير الدقيقة.</li>
  <li><strong>حق الحذف:</strong> طلب حذف بياناتك الشخصية.</li>
  <li><strong>حق تقييد المعالجة:</strong> تقييد كيفية معالجة بياناتك.</li>
  <li><strong>حق نقل البيانات:</strong> الحصول على بياناتك بتنسيق قابل للقراءة آلياً.</li>
  <li><strong>حق الاعتراض:</strong> الاعتراض على معالجة بياناتك.</li>
  <li><strong>حق سحب الموافقة:</strong> سحب موافقتك في أي وقت.</li>
</ul>`;

// ─── Cookie Policy ──────────────────────────────────────────────────────────

const COOKIE_BODY = `<h2>1. What are Cookies?</h2>
<p>Cookies are small text files that are placed on your device (computer, mobile phone, or tablet) when you visit our website. They allow us to recognize your device and collect certain information about your browsing actions and preferences. Cookies can be &ldquo;persistent&rdquo; cookies, which stay on your device for a set period, or &ldquo;session&rdquo; cookies, which are temporary and expire when you close your browser.</p>

<h2>2. Types of Cookies We Use</h2>
<p>We use the following types of cookies on our website:</p>
<ul>
  <li><strong>Strictly Necessary Cookies:</strong> These cookies are essential for the operation of our Website and enable you to navigate and use its features. They are usually set in response to your actions, such as filling out forms or setting preferences.</li>
  <li><strong>Performance Cookies:</strong> These cookies collect anonymous information about how visitors use our Website, such as the pages they visit and any errors encountered. This helps us improve the performance and usability of our Website.</li>
  <li><strong>Functional Cookies:</strong> These cookies enable our Website to remember choices you have made (such as language preferences) and provide enhanced functionality. They may also be used to provide certain features you request, such as personalized content or saved job searches.</li>
  <li><strong>Targeting/Advertising Cookies:</strong> These cookies track your browsing habits and allow us to deliver targeted advertisements based on your interests. They may also be used by third-party advertisers to serve ads on our Website or other websites you visit.</li>
</ul>

<h2>3. Third-Party Cookies</h2>
<p>We may also use third-party cookies on our website for various purposes, such as analytics, advertising, or social media integration. Third-party service providers who place these cookies have their own privacy rules. We do not have control over these cookies, and their use is subject to the respective providers&rsquo; privacy policies. We recommend reviewing the privacy policies of these third parties to understand how they collect, use, and protect your information.</p>

<h2>4. Cookie Consent and Control</h2>
<p>By using our website, you consent to the use of cookies as described in this Cookie Policy. You can manage your cookie preferences and control the use of cookies through your browser settings. Most web browsers allow you to accept, reject, delete, or be notified when a cookie is being sent. Please note that disabling or blocking certain cookies may affect the functionality and usability of our website.</p>

<h2>5. Changes to this Cookie Policy</h2>
<p>We may update this Cookie Policy from time to time to reflect changes in our use of cookies or applicable laws and regulations. Any updates will be posted on this page, and the &ldquo;Last Updated&rdquo; date will be revised accordingly. We encourage you to review this policy periodically for any changes.</p>`;

const COOKIE_BODY_AR = `<h2>1. ما هي ملفات تعريف الارتباط؟</h2>
<p>ملفات تعريف الارتباط هي ملفات نصية صغيرة توضع على جهازك (الكمبيوتر، الهاتف المحمول، أو الجهاز اللوحي) عند زيارة موقعنا. تتيح لنا التعرف على جهازك وجمع معلومات معينة حول إجراءات التصفح وتفضيلاتك. يمكن أن تكون ملفات تعريف الارتباط "دائمة" تبقى على جهازك لفترة محددة، أو ملفات "جلسة" مؤقتة تنتهي صلاحيتها عند إغلاق المتصفح.</p>

<h2>2. أنواع ملفات تعريف الارتباط التي نستخدمها</h2>
<p>نستخدم الأنواع التالية من ملفات تعريف الارتباط على موقعنا:</p>
<ul>
  <li><strong>ملفات تعريف الارتباط الضرورية:</strong> هذه الملفات ضرورية لتشغيل الموقع وتمكينك من التنقل واستخدام ميزاته.</li>
  <li><strong>ملفات تعريف الارتباط الخاصة بالأداء:</strong> تجمع هذه الملفات معلومات مجهولة الهوية حول كيفية استخدام الزوار لموقعنا.</li>
  <li><strong>ملفات تعريف الارتباط الوظيفية:</strong> تتيح هذه الملفات لموقعنا تذكر الخيارات التي قمت بها (مثل تفضيلات اللغة) وتوفير وظائف محسنة.</li>
  <li><strong>ملفات تعريف الارتباط الإعلانية:</strong> تتبع هذه الملفات عادات التصفح الخاصة بك وتسمح لنا بتقديم إعلانات مستهدفة بناءً على اهتماماتك.</li>
</ul>

<h2>3. ملفات تعريف الارتباط الخاصة بالجهات الخارجية</h2>
<p>قد نستخدم أيضاً ملفات تعريف الارتباط الخاصة بجهات خارجية لأغراض مختلفة مثل التحليلات والإعلانات وتكامل وسائل التواصل الاجتماعي. ليس لدينا سيطرة على هذه الملفات ويخضع استخدامها لسياسات الخصوصية الخاصة بمقدمي الخدمات المعنيين.</p>

<h2>4. الموافقة على ملفات تعريف الارتباط والتحكم فيها</h2>
<p>باستخدام موقعنا، فإنك توافق على استخدام ملفات تعريف الارتباط كما هو موضح في هذه السياسة. يمكنك إدارة تفضيلات ملفات تعريف الارتباط والتحكم فيها من خلال إعدادات المتصفح. يرجى ملاحظة أن تعطيل بعض ملفات تعريف الارتباط قد يؤثر على وظائف الموقع.</p>

<h2>5. التغييرات على سياسة ملفات تعريف الارتباط</h2>
<p>قد نقوم بتحديث سياسة ملفات تعريف الارتباط هذه من وقت لآخر. سيتم نشر أي تحديثات على هذه الصفحة وسيتم تعديل تاريخ "آخر تحديث" وفقاً لذلك.</p>`;

async function update() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const pages = [
    {
      slug: "privacy-policy",
      title: "Privacy Policy",
      titleAr: "سياسة الخصوصية",
      body: PRIVACY_BODY,
      bodyAr: PRIVACY_BODY_AR,
    },
    {
      slug: "cookie-policy",
      title: "Cookie Policy",
      titleAr: "سياسة ملفات تعريف الارتباط",
      body: COOKIE_BODY,
      bodyAr: COOKIE_BODY_AR,
    },
  ];

  for (const page of pages) {
    await StaticPage.findOneAndUpdate(
      { slug: page.slug },
      { ...page, isActive: true },
      { upsert: true }
    );
    console.log(`  ✅ Updated "${page.slug}"`);
  }

  console.log("\nDone!");
  await mongoose.disconnect();
}

update().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
