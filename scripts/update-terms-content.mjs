/**
 * Update terms-and-conditions page with the official content.
 *
 * Usage:
 *   node --env-file=.env scripts/update-terms-content.mjs
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

const TERMS_BODY = `<h2 class="text-2xl font-bold mb-6">1. User Eligibility</h2>
<p>By using the website, you represent and warrant that you are at least 18 years old and have the legal capacity to enter into binding contracts. If you are accessing the website on behalf of a company or organization, you represent and warrant that you have the authority to bind such entity to these Terms and Conditions.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">2. Use of the Website</h2>

<h3 class="text-lg font-semibold mt-6 mb-3">2.1 Content and Intellectual Property Rights</h3>
<p>All content on the website, including text, graphics, logos, images, videos, and software, is the property of MPLOYEDIN UK LTD or its licensors and is protected by applicable intellectual property laws. You may access and view the content on the website for personal, non-commercial use only. You must not reproduce, distribute, modify, or create derivative works of the content without our prior written consent.</p>

<h3 class="text-lg font-semibold mt-6 mb-3">2.2 Prohibited Activities</h3>
<p>When using the website, you agree not to:</p>
<ul>
  <li>Violate any applicable laws, regulations, or third-party rights.</li>
  <li>Post, upload, or transmit any content that is unlawful, harmful, defamatory, obscene, or infringing upon the rights of others.</li>
  <li>Interfere with or disrupt the functionality of the Website or its servers.</li>
  <li>Engage in any fraudulent or deceptive activities.</li>
  <li>Use the Website for any unauthorized commercial purposes, including spamming or solicitation.</li>
</ul>

<h2 class="text-2xl font-bold mt-10 mb-6">3. Job Postings and Applications</h2>

<h3 class="text-lg font-semibold mt-6 mb-3">3.1 Job Postings</h3>
<p>The website allows employers to post job listings and job seekers to apply for those listings. We do not guarantee the accuracy, quality, or availability of any job postings on the website. Employers are solely responsible for the content of their job postings.</p>

<h3 class="text-lg font-semibold mt-6 mb-3">3.2 Job Applications</h3>
<p>Job seekers may submit applications for job listings posted on the website. We do not guarantee that employers will review or respond to all applications. Job seekers are solely responsible for the accuracy and completeness of their application materials.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">4. Disclaimer of Warranties</h2>
<p>The website is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without any warranties or representations, either expressed or implied. We disclaim all warranties, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the website will be uninterrupted, error-free, or free from viruses or other harmful components. Your use of the website is at your own risk.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">5. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, we shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising out of or in connection with your use of the Website, including but not limited to damages for loss of profits, data, or other intangible losses. This limitation applies whether the alleged liability is based on contract, tort, negligence, strict liability, or any other legal theory.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">6. Indemnification</h2>
<p>You agree to indemnify and hold MPLOYEDIN UK LTD and its officers, directors, employees, and agents harmless from any claims, demands, losses, liabilities, and expenses (including legal fees) arising out of or in connection with your use of the Website, your violation of these Terms and Conditions, or your violation of any applicable laws or regulations.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">7. Modifications to the Terms and Conditions</h2>
<p>We reserve the right to modify or update these Terms and Conditions at any time without prior notice. Any changes will be effective immediately upon posting on the website. Your continued use of the website after the posting of the changes constitutes your acceptance of the revised Terms and Conditions.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">8. Governing Law and Jurisdiction</h2>
<p>These Terms and Conditions shall be governed by and construed in accordance with the laws of the United Kingdom. Any disputes arising out of or in connection with these Terms and Conditions shall be subject to the exclusive jurisdiction of the courts of the United Kingdom.</p>`;

const TERMS_BODY_AR = `<h2 class="text-2xl font-bold mb-6">1. أهلية المستخدم</h2>
<p>باستخدام الموقع، فإنك تقر وتضمن أنك تبلغ من العمر 18 عامًا على الأقل ولديك الأهلية القانونية لإبرام عقود ملزمة. إذا كنت تصل إلى الموقع نيابة عن شركة أو مؤسسة، فإنك تقر وتضمن أن لديك الصلاحية لإلزام هذا الكيان بهذه الشروط والأحكام.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">2. استخدام الموقع</h2>

<h3 class="text-lg font-semibold mt-6 mb-3">2.1 المحتوى وحقوق الملكية الفكرية</h3>
<p>جميع المحتويات على الموقع، بما في ذلك النصوص والرسومات والشعارات والصور ومقاطع الفيديو والبرمجيات، هي ملك لشركة MPLOYEDIN UK LTD أو مرخصيها ومحمية بموجب قوانين الملكية الفكرية المعمول بها. يمكنك الوصول إلى المحتوى وعرضه على الموقع للاستخدام الشخصي غير التجاري فقط.</p>

<h3 class="text-lg font-semibold mt-6 mb-3">2.2 الأنشطة المحظورة</h3>
<p>عند استخدام الموقع، توافق على عدم:</p>
<ul>
  <li>انتهاك أي قوانين أو لوائح أو حقوق أطراف ثالثة.</li>
  <li>نشر أو تحميل أو إرسال أي محتوى غير قانوني أو ضار أو مسيء أو فاحش.</li>
  <li>التدخل في وظائف الموقع أو خوادمه أو تعطيلها.</li>
  <li>الانخراط في أي أنشطة احتيالية أو خادعة.</li>
  <li>استخدام الموقع لأي أغراض تجارية غير مصرح بها.</li>
</ul>

<h2 class="text-2xl font-bold mt-10 mb-6">3. إعلانات الوظائف والتقديمات</h2>

<h3 class="text-lg font-semibold mt-6 mb-3">3.1 إعلانات الوظائف</h3>
<p>يتيح الموقع لأصحاب العمل نشر قوائم الوظائف وللباحثين عن عمل التقدم لها. نحن لا نضمن دقة أو جودة أو توفر أي إعلانات وظائف على الموقع. أصحاب العمل هم المسؤولون وحدهم عن محتوى إعلانات الوظائف الخاصة بهم.</p>

<h3 class="text-lg font-semibold mt-6 mb-3">3.2 طلبات التوظيف</h3>
<p>يمكن للباحثين عن عمل تقديم طلبات للوظائف المنشورة على الموقع. نحن لا نضمن أن أصحاب العمل سيراجعون أو يردون على جميع الطلبات. الباحثون عن عمل هم المسؤولون وحدهم عن دقة واكتمال مواد طلباتهم.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">4. إخلاء المسؤولية عن الضمانات</h2>
<p>يتم تقديم الموقع على أساس "كما هو" و"كما هو متاح"، دون أي ضمانات أو إقرارات صريحة أو ضمنية. نحن نخلي مسؤوليتنا عن جميع الضمانات. استخدامك للموقع على مسؤوليتك الخاصة.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">5. تحديد المسؤولية</h2>
<p>إلى أقصى حد يسمح به القانون، لن نكون مسؤولين عن أي أضرار مباشرة أو غير مباشرة أو عرضية أو تبعية أو عقابية ناشئة عن أو فيما يتعلق باستخدامك للموقع.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">6. التعويض</h2>
<p>توافق على تعويض شركة MPLOYEDIN UK LTD ومسؤوليها ومديريها وموظفيها ووكلائها وحمايتهم من أي مطالبات أو خسائر أو مسؤوليات ونفقات ناشئة عن استخدامك للموقع أو انتهاكك لهذه الشروط والأحكام.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">7. تعديلات الشروط والأحكام</h2>
<p>نحتفظ بالحق في تعديل أو تحديث هذه الشروط والأحكام في أي وقت دون إشعار مسبق. أي تغييرات ستكون سارية المفعول فور نشرها على الموقع.</p>

<h2 class="text-2xl font-bold mt-10 mb-6">8. القانون الحاكم والاختصاص القضائي</h2>
<p>تخضع هذه الشروط والأحكام لقوانين المملكة المتحدة وتُفسر وفقًا لها. أي نزاعات تنشأ عن هذه الشروط تخضع للاختصاص القضائي الحصري لمحاكم المملكة المتحدة.</p>`;

async function update() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const result = await StaticPage.findOneAndUpdate(
    { slug: "terms-and-conditions" },
    {
      title: "Terms & Conditions",
      titleAr: "الشروط والأحكام",
      body: TERMS_BODY,
      bodyAr: TERMS_BODY_AR,
      isActive: true,
    },
    { new: true, upsert: true }
  );

  console.log(`✅ Updated "terms-and-conditions" (id: ${result._id})`);
  await mongoose.disconnect();
}

update().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
