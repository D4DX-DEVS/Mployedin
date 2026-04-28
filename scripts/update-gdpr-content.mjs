/**
 * Update GDPR page with official content from mployedin.com.
 *
 * Usage:
 *   node --env-file=.env scripts/update-gdpr-content.mjs
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

const GDPR_BODY = `<h2>Consent Forms</h2>

<h3>1. Consent for Data Processing</h3>

<h4>1.1 Purpose of Consent</h4>
<p>We may collect and process personal data for various purposes, such as providing our job portal services, improving the user experience, and complying with legal obligations. We obtain consent from individuals before processing their personal data, except where another legal basis for processing applies.</p>

<h4>1.2 Voluntary Nature of Consent</h4>
<p>Consent is voluntary, and individuals have the right to refuse or withdraw consent at any time without any negative consequences. However, please note that withdrawing consent may affect our ability to provide certain services.</p>

<h4>1.3 Informed Consent</h4>
<p>We ensure that individuals provide informed consent by providing clear and concise information about the purposes and methods of data processing, the categories of personal data collected, and any third parties with whom the data may be shared.</p>

<h4>1.4 Obtaining Consent</h4>
<p>We obtain consent through explicit actions, such as ticking a box or clicking a button, that clearly indicate the individual&rsquo;s agreement to the processing of their personal data. We do not use pre-ticked boxes or assume consent from silence or inactivity.</p>

<h4>1.5 Revoking Consent</h4>
<p>Individuals have the right to revoke their consent at any time by contacting us using the information provided below. We will promptly act upon any revocation request and cease the processing of personal data, except where another legal basis for processing applies.</p>

<h3>2. Consent for Direct Marketing</h3>

<h4>2.1 Direct Marketing Communications</h4>
<p>We may send direct marketing communications, such as newsletters or promotional offers, to individuals who have provided their consent. Direct marketing communications will be tailored to the individual&rsquo;s preferences, and individuals can choose the types of communications they wish to receive.</p>

<h4>2.2 Opt-out Mechanism</h4>
<p>We provide an easy and accessible opt-out mechanism in every direct marketing communication. Individuals can unsubscribe from receiving further marketing communications by following the instructions provided or by contacting us.</p>

<h2>Data Breach Response Plan</h2>

<h3>1. Data Breach Identification and Reporting</h3>

<h4>1.1 Detection and Initial Assessment</h4>
<p>Any employee who suspects or becomes aware of a potential data breach must immediately report it to the designated Data Protection Officer (DPO) or the relevant department responsible for data protection.</p>

<h4>1.2 Investigation and Assessment</h4>
<p>Upon receiving a report of a potential data breach, the DPO or the designated team will promptly investigate the incident to assess the nature, scope, and severity of the breach. This may involve gathering information, conducting technical analysis, and collaborating with relevant stakeholders.</p>

<h4>1.3 Notification Obligations</h4>
<p>If the data breach is likely to result in a risk to the rights and freedoms of individuals, we will notify the relevant supervisory authority, the Information Commissioner&rsquo;s Office (ICO), without undue delay and, where feasible, within 72 hours of becoming aware of the breach. The notification will include details of the breach, the affected individuals, and any mitigating actions taken.</p>

<h4>1.4 Communication with Affected Individuals</h4>
<p>In cases where the data breach is likely to result in a high risk to the rights and freedoms of individuals, we will also communicate directly with the affected individuals, providing clear and timely information about the breach, the potential risks, and any recommended actions they should take to protect themselves.</p>

<h3>2. Mitigation and Response</h3>

<h4>2.1 Containment and Recovery</h4>
<p>Upon confirming a data breach, we will take immediate steps to contain and minimize the impact of the breach. This may include isolating affected systems, disabling compromised accounts, or implementing additional security measures to prevent further unauthorized access.</p>

<h4>2.2 Documentation and Evidence Preservation</h4>
<p>We will maintain accurate records of the data breach, including the date and time of the breach, the nature of the incident, the affected data subjects, and the actions taken to address the breach. These records will serve as evidence of compliance and may be required for reporting purposes.</p>

<h4>2.3 Remediation and Preventive Measures</h4>
<p>After addressing the immediate impact of the data breach, we will conduct a thorough review of our security measures and implement any necessary remedial actions to prevent similar incidents in the future. This may involve revising security protocols, providing additional training to employees, or updating systems and safeguards.</p>

<h3>3. Communication and Notification</h3>

<h4>3.1 Internal Communication</h4>
<p>We will ensure timely and appropriate communication within our organization, informing relevant stakeholders, such as senior management, legal advisors, and IT teams, about the data breach and the actions being taken to respond to it.</p>

<h4>3.2 External Communication</h4>
<p>We will coordinate external communication efforts in compliance with legal requirements. This includes notifying the ICO, affected individuals, and any other relevant parties, such as law enforcement agencies or third-party service providers, as necessary.</p>

<h3>4. Documentation and Review</h3>
<p>We will maintain comprehensive documentation of all data breaches, response actions, and notifications. This documentation will be regularly reviewed and updated to reflect changes in our data breach response procedures, regulatory requirements, and best practices.</p>

<h3>5. Training and Awareness</h3>
<p>We will provide regular training and awareness programs to employees to ensure they understand their roles and responsibilities in detecting, reporting, and responding to data breaches. This training will encompass information on the importance of data protection, security protocols, and incident response procedures.</p>

<h2>Data Subject Rights Policy</h2>

<p>This Data Subject Rights Policy applies to individuals who are data subjects whose personal data is processed by us through our website at mployedin.com.</p>

<h3>1. Your Rights</h3>
<p>As a data subject, you have certain rights regarding your personal data. These rights include:</p>

<h4>1.1 Right to Access</h4>
<p>You have the right to request access to the personal data we hold about you. Upon receiving a valid request, we will provide you with a copy of your personal data in a commonly used electronic format, unless otherwise requested.</p>

<h4>1.2 Right to Rectification</h4>
<p>If you believe that the personal data we hold about you is inaccurate or incomplete, you have the right to request the correction or updating of your personal data.</p>

<h4>1.3 Right to Erasure</h4>
<p>Under certain circumstances, you have the right to request the erasure of your personal data. This right applies when your personal data is no longer necessary for the purposes for which it was collected or when you withdraw your consent (where applicable) and there is no other legal ground for processing.</p>

<h4>1.4 Right to Restriction of Processing</h4>
<p>You have the right to request the restriction of the processing of your personal data in certain situations. This means we will store your personal data but not process it further, except in limited circumstances.</p>

<h4>1.5 Right to Data Portability</h4>
<p>You have the right to receive the personal data you have provided to us in a structured, commonly used, and machine-readable format. You also have the right to request that we transmit this data to another data controller, where technically feasible.</p>

<h4>1.6 Right to Object</h4>
<p>You have the right to object to the processing of your personal data in certain circumstances, such as for direct marketing purposes or when processing is based on legitimate interests.</p>

<h4>1.7 Right to Withdraw Consent</h4>
<p>If we rely on your consent as the legal basis for processing your personal data, you have the right to withdraw your consent at any time. Please note that withdrawing consent does not affect the lawfulness of processing based on consent before its withdrawal.</p>

<h3>2. Exercising Your Data Subject Rights</h3>
<p>To exercise your data subject rights, please submit a written request to us using the contact details provided below. We will respond to your request without undue delay and within one month, unless an extension is permitted under applicable law.</p>
<p>To verify your identity and ensure the security of your personal data, we may request additional information from you. In certain cases, we may not be able to fulfill your request if it infringes on the rights of others or if there are legal obligations or legitimate interests that override your request.</p>

<h3>3. Updates to this Policy</h3>
<p>We may update this Data Subject Rights Policy from time to time to reflect changes in our data processing practices or in applicable laws and regulations. Any updates will be posted on this page, and the &ldquo;Last Updated&rdquo; date will be revised accordingly. We encourage you to review this policy periodically for any changes.</p>`;

const GDPR_BODY_AR = `<h2>نماذج الموافقة</h2>

<h3>1. الموافقة على معالجة البيانات</h3>

<h4>1.1 الغرض من الموافقة</h4>
<p>قد نقوم بجمع ومعالجة البيانات الشخصية لأغراض مختلفة، مثل تقديم خدمات بوابة الوظائف، وتحسين تجربة المستخدم، والامتثال للالتزامات القانونية. نحصل على موافقة الأفراد قبل معالجة بياناتهم الشخصية، إلا في الحالات التي ينطبق فيها أساس قانوني آخر للمعالجة.</p>

<h4>1.2 الطبيعة الطوعية للموافقة</h4>
<p>الموافقة طوعية، وللأفراد الحق في رفض أو سحب الموافقة في أي وقت دون أي عواقب سلبية. ومع ذلك، يرجى ملاحظة أن سحب الموافقة قد يؤثر على قدرتنا على تقديم بعض الخدمات.</p>

<h4>1.3 الموافقة المستنيرة</h4>
<p>نحرص على أن يقدم الأفراد موافقة مستنيرة من خلال توفير معلومات واضحة وموجزة حول أغراض وطرق معالجة البيانات، وفئات البيانات الشخصية المجمعة، وأي أطراف ثالثة قد تتم مشاركة البيانات معها.</p>

<h4>1.4 الحصول على الموافقة</h4>
<p>نحصل على الموافقة من خلال إجراءات صريحة، مثل تحديد مربع أو النقر على زر، تشير بوضوح إلى موافقة الفرد على معالجة بياناته الشخصية. لا نستخدم مربعات محددة مسبقاً ولا نفترض الموافقة من الصمت أو عدم النشاط.</p>

<h4>1.5 إلغاء الموافقة</h4>
<p>للأفراد الحق في إلغاء موافقتهم في أي وقت من خلال الاتصال بنا. سنتصرف فوراً بناءً على أي طلب إلغاء ونوقف معالجة البيانات الشخصية.</p>

<h3>2. الموافقة على التسويق المباشر</h3>

<h4>2.1 الاتصالات التسويقية المباشرة</h4>
<p>قد نرسل اتصالات تسويقية مباشرة، مثل النشرات الإخبارية أو العروض الترويجية، للأفراد الذين قدموا موافقتهم.</p>

<h4>2.2 آلية إلغاء الاشتراك</h4>
<p>نوفر آلية سهلة لإلغاء الاشتراك في كل اتصال تسويقي مباشر.</p>

<h2>خطة الاستجابة لخرق البيانات</h2>

<h3>1. تحديد خرق البيانات والإبلاغ عنه</h3>

<h4>1.1 الكشف والتقييم الأولي</h4>
<p>يجب على أي موظف يشتبه أو يعلم بخرق محتمل للبيانات الإبلاغ عنه فوراً إلى مسؤول حماية البيانات (DPO) المعين.</p>

<h4>1.2 التحقيق والتقييم</h4>
<p>عند تلقي تقرير عن خرق محتمل للبيانات، سيقوم مسؤول حماية البيانات بالتحقيق الفوري في الحادث لتقييم طبيعته ونطاقه وشدته.</p>

<h4>1.3 التزامات الإخطار</h4>
<p>إذا كان خرق البيانات من المحتمل أن يشكل خطراً على حقوق وحريات الأفراد، فسنقوم بإخطار مكتب مفوض المعلومات (ICO) في غضون 72 ساعة من علمنا بالخرق.</p>

<h4>1.4 التواصل مع الأفراد المتضررين</h4>
<p>في الحالات عالية المخاطر، سنتواصل مباشرة مع الأفراد المتضررين مع تقديم معلومات واضحة حول الخرق والمخاطر المحتملة وأي إجراءات موصى بها.</p>

<h3>2. التخفيف والاستجابة</h3>

<h4>2.1 الاحتواء والتعافي</h4>
<p>عند تأكيد خرق البيانات، سنتخذ خطوات فورية للاحتواء وتقليل تأثير الخرق.</p>

<h4>2.2 التوثيق وحفظ الأدلة</h4>
<p>سنحتفظ بسجلات دقيقة لخرق البيانات تشمل التاريخ والوقت وطبيعة الحادث والإجراءات المتخذة.</p>

<h4>2.3 الإصلاح والتدابير الوقائية</h4>
<p>بعد معالجة التأثير المباشر، سنجري مراجعة شاملة لتدابيرنا الأمنية وننفذ أي إجراءات تصحيحية ضرورية.</p>

<h2>سياسة حقوق أصحاب البيانات</h2>

<h3>1. حقوقك</h3>
<p>بصفتك صاحب بيانات، لديك الحقوق التالية:</p>

<h4>1.1 حق الوصول</h4>
<p>لديك الحق في طلب الوصول إلى البيانات الشخصية التي نحتفظ بها عنك. سنقدم لك نسخة من بياناتك بتنسيق إلكتروني شائع الاستخدام.</p>

<h4>1.2 حق التصحيح</h4>
<p>إذا كنت تعتقد أن بياناتك الشخصية غير دقيقة أو غير كاملة، لديك الحق في طلب تصحيحها أو تحديثها.</p>

<h4>1.3 حق الحذف</h4>
<p>في ظروف معينة، لديك الحق في طلب حذف بياناتك الشخصية (الحق في النسيان).</p>

<h4>1.4 حق تقييد المعالجة</h4>
<p>لديك الحق في طلب تقييد معالجة بياناتك الشخصية في حالات معينة.</p>

<h4>1.5 حق نقل البيانات</h4>
<p>لديك الحق في تلقي بياناتك الشخصية بتنسيق منظم وقابل للقراءة آلياً وطلب نقلها إلى جهة تحكم أخرى.</p>

<h4>1.6 حق الاعتراض</h4>
<p>لديك الحق في الاعتراض على معالجة بياناتك الشخصية لأغراض التسويق المباشر أو عندما تستند المعالجة إلى مصالح مشروعة.</p>

<h4>1.7 حق سحب الموافقة</h4>
<p>إذا اعتمدنا على موافقتك كأساس قانوني، لديك الحق في سحب موافقتك في أي وقت.</p>

<h3>2. ممارسة حقوقك</h3>
<p>لممارسة حقوقك، يرجى تقديم طلب كتابي باستخدام بيانات الاتصال المذكورة أدناه. سنستجيب لطلبك في غضون شهر واحد.</p>`;

async function update() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  await StaticPage.findOneAndUpdate(
    { slug: "gdpr" },
    {
      title: "GDPR & Data Protection",
      titleAr: "حماية البيانات (GDPR)",
      body: GDPR_BODY,
      bodyAr: GDPR_BODY_AR,
      isActive: true,
    },
    { upsert: true }
  );

  console.log('  ✅ Updated "gdpr"');
  console.log("\nDone!");
  await mongoose.disconnect();
}

update().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
