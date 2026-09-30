import type { LegalPageSlug } from "@/lib/cms/legalPages";

/**
 * Starting content for a legal page that is missing from the database. Static
 * Pages inserts it once, unpublished, so the admin reviews and edits it before
 * turning it on; an existing page is never touched. Server-only (the admin list
 * route imports it) so the HTML stays out of client bundles.
 *
 * The Accessibility Statement says what the site aims for and how to report a
 * barrier. It claims no audited conformance: the admin adds known issues and
 * the review date once they are known.
 */
export const LEGAL_PAGE_DRAFTS: Partial<Record<LegalPageSlug, { body: string; bodyAr: string }>> = {
  "accessibility-statement": {
    body: [
      "<h2>Our commitment</h2>",
      "<p>MPLOYEDIN should be usable by everyone looking for work or hiring, including people who use a screen reader, screen magnifier, voice control or only a keyboard.</p>",
      "<h2>The standard we work to</h2>",
      "<p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We build and check new features against that standard.</p>",
      "<h2>What we have in place</h2>",
      "<ul>",
      "<li>A \"Skip to main content\" link at the top of every page.</li>",
      "<li>Keyboard navigation with visible focus indicators, which we check as we build new pages.</li>",
      "<li>The site in English and Arabic, with a right-to-left layout in Arabic.</li>",
      "<li>Layouts that adapt to phones, tablets and computers.</li>",
      "</ul>",
      "<h2>Known limitations</h2>",
      "<p>Some content may not yet be fully accessible, for example documents uploaded by employers or candidates and content from third-party services. We are working to fix the problems we know about.</p>",
      "<h2>Tell us about a problem</h2>",
      "<p>If something on MPLOYEDIN is hard to use, or you need information in a different format, email <a href=\"mailto:support@mployedin.com\">support@mployedin.com</a>. Tell us the page address and what went wrong.</p>",
      "<h2>Review of this statement</h2>",
      "<p>We review this statement regularly and update it when the site changes.</p>",
    ].join("\n"),
    bodyAr: [
      "<h2>التزامنا</h2>",
      "<p>نريد أن تكون MPLOYEDIN سهلة الاستخدام لكل من يبحث عن عمل أو يوظّف، بما في ذلك من يستخدمون قارئ الشاشة أو مكبّر الشاشة أو التحكم الصوتي أو لوحة المفاتيح فقط.</p>",
      "<h2>المعيار الذي نعمل وفقه</h2>",
      "<p>نسعى إلى استيفاء إرشادات الوصول إلى محتوى الويب (WCAG) 2.2 بالمستوى AA، ونبني الميزات الجديدة ونراجعها وفق هذا المعيار.</p>",
      "<h2>ما وفّرناه</h2>",
      "<ul>",
      "<li>رابط \"انتقل إلى المحتوى الرئيسي\" أعلى كل صفحة.</li>",
      "<li>التنقل بلوحة المفاتيح مع مؤشرات تركيز واضحة، ونتحقق منها عند بناء الصفحات الجديدة.</li>",
      "<li>الموقع باللغتين الإنجليزية والعربية، مع تخطيط من اليمين إلى اليسار في العربية.</li>",
      "<li>تخطيطات تتكيف مع الهواتف والأجهزة اللوحية وأجهزة الكمبيوتر.</li>",
      "</ul>",
      "<h2>القيود المعروفة</h2>",
      "<p>قد لا يكون بعض المحتوى متاحًا بالكامل بعد، مثل المستندات التي يرفعها أصحاب العمل أو المرشحون والمحتوى المقدَّم من خدمات خارجية. نعمل على إصلاح المشكلات التي نعرفها.</p>",
      "<h2>أبلغنا عن مشكلة</h2>",
      "<p>إذا واجهت صعوبة في استخدام أي جزء من MPLOYEDIN، أو احتجت إلى المعلومات بصيغة أخرى، راسلنا على <a href=\"mailto:support@mployedin.com\">support@mployedin.com</a> واذكر عنوان الصفحة وما حدث.</p>",
      "<h2>مراجعة هذا البيان</h2>",
      "<p>نراجع هذا البيان بانتظام ونحدّثه عند تغيّر الموقع.</p>",
    ].join("\n"),
  },
};
