/**
 * Builds the Cookie Policy page (English and Arabic HTML) from the registry of
 * everything the site can store on a device (src/lib/consent/registry.ts, read
 * here as the rows of registry.json) and from the Cookie settings dialog's own
 * message strings, so the policy and the dialog say the same thing.
 *
 * Pure: no I/O, no database, no clock. scripts/update-legal-content.mjs does
 * the reading and the (opt-in) writing.
 *
 * It fails loudly rather than print something untrue:
 *  - a row with a category the text has no section for (e.g. analytics) throws,
 *    because the sentence "We do not use analytics or advertising cookies."
 *    would no longer be true;
 *  - a row with a kind, basis, party or duration it has no wording for throws;
 *  - a section that would have an empty table throws (its prose is then stale).
 *
 * Output is limited to what the CMS sanitiser keeps (headings, paragraphs,
 * lists, tables, code, links, `class`). The sanitiser also drops `id`, so the
 * section ids below do not give anchors on the live page; they are what the
 * tests, the review copy and any future sanitiser change use.
 *
 * [LEGAL] every sentence below is draft wording for solicitor sign-off.
 */

export const COOKIE_POLICY_LOCALES = ["en", "ar"];

/**
 * The (category, basis) pairs the prose is true for. The category decides which
 * section a row sits in; the basis decides what that section says about it
 * ("we don't need your permission", "we don't ask first", "your permission").
 * A row whose basis stops matching its category must stop the build, not print
 * a sentence that contradicts it.
 */
export const ALLOWED_PAIRS = {
  necessary: ["strictly-necessary", "user-action"],
  preferences: ["appearance"],
  media: ["consent"],
};

/** The only categories the policy text is true for. */
export const ALLOWED_CATEGORIES = Object.keys(ALLOWED_PAIRS);

/** Same ids, same order, in every language. */
/**
 * Written as an HTML comment at the top of every policy this module builds, so the public page API can tell the
 * applied generated text from the CMS page's older, hand-written text (which said "By using our website, you
 * consent"): a cookie-policy body without it is answered with the generated policy instead
 * (src/lib/cms/cookiePolicyFallback.ts). Never change it without changing that check.
 */
export const GENERATED_POLICY_MARKER = "mployedin:cookie-policy:generated-from-registry";

export const COOKIE_POLICY_SECTION_IDS = [
  "what-are-cookies",
  "strictly-necessary",
  "click-only",
  "display-settings",
  "media",
  "no-analytics",
  "change-your-choice",
  "withdrawal",
  "changes",
  "contact",
];

/**
 * [LEGAL] True only while ALLOWED_CATEGORIES is the whole list of categories;
 * buildCookiePolicy throws for any other, and the Jest guard checks both.
 */
export const NO_ANALYTICS_SENTENCE = {
  en: "We do not use analytics or advertising cookies.",
  ar: "لا نستخدم ملفات تعريف ارتباط للتحليلات أو الإعلانات.",
};

const KINDS = ["cookie", "localStorage", "sessionStorage", "indexedDB", "cacheStorage", "serviceWorker", "thirdPartyHost"];
const BASES = ["strictly-necessary", "appearance", "consent", "user-action"];
const PARTIES = ["first", "third"];

const GOOGLE_CONTROLS_URL = "https://myaccount.google.com/data-and-privacy";
const SUPPORT_EMAIL = "support@mployedin.com";
const COMPANY_ADDRESS = "MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR";

// Utility classes already used elsewhere under src/ (Tailwind only generates what it finds there).
const TABLE_WRAP_CLASS = "overflow-x-auto";
const TABLE_CLASS = "w-full text-sm border-collapse";
const TH_CLASS = "border-b border-border/60 bg-muted/40 px-3 py-2 text-start font-semibold";
const TD_CLASS = "border-b border-border/40 px-3 py-2 align-top";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for an HTML text node or a double-quoted attribute. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// ─── Wording ────────────────────────────────────────────────────────────────
// Static strings here are written as HTML (entities already); anything that
// comes from the registry or the messages is escaped where it is interpolated.

const COPY = {
  en: {
    quotes: ["&ldquo;", "&rdquo;"],
    columns: ["Name", "Type", "What it is for", "How long", "Set by", "Why we can use it"],
    withdrawalColumns: ["Choice", "What stops straight away", "What is removed from your device", "What can&rsquo;t be undone"],
    kinds: {
      cookie: "Cookie",
      localStorage: "Local storage",
      sessionStorage: "Session storage",
      indexedDB: "IndexedDB",
      cacheStorage: "Cache",
      serviceWorker: "Service worker",
      thirdPartyHost: "Host your browser contacts",
    },
    parties: { first: "First party (us)", third: "Third party (another company)" },
    bases: {
      appearance: "Display setting (kept unless you object)",
      consent: "Your permission",
      "user-action": "You asked for it",
    },
    durations: {
      "session / up to 3 days": "Browser session, or up to 3 days",
      session: "Browser session",
      "2 hours": "2 hours",
      "30 minutes": "30 minutes",
      "6 months": "6 months",
      "until sign-out": "Until you sign out",
      "until removed": "Until you remove it",
      "until removed (this visit only if you object)": "Until you remove it, or this visit only if you object",
      tab: "Until you close the tab",
      "none (held in memory only)": "None kept (held in memory only)",
      "deleted on the next full page load": "Deleted on the next full page load",
      "per Google": "As set by Google",
      "until uninstalled": "Until you uninstall the app",
      "until notifications/app removed": "Until you turn off notifications or remove the app",
      "up to 30 days, static assets only": "Up to 30 days (site files only)",
      "with SW": "As long as the installed app",
      "n/a": "Not applicable",
      "12 months": "12 months",
      "12 months (session if not allowed)": "12 months, or this visit only if you object",
    },
    wildcardNotes: {
      suffix: "A name ending in * stands for a group of names that begin the same way.",
      subdomain: "A name starting with *. stands for any address under that domain.",
    },
    installedApp: "Installed app and notifications",
    titles: {
      "what-are-cookies": "What cookies and similar technologies are",
      "strictly-necessary": "Strictly necessary",
      "click-only": "Things that load only when you click",
      "display-settings": "Display settings",
      media: "Videos from YouTube",
      "no-analytics": "Analytics and adverts",
      "change-your-choice": "How to change your choice",
      withdrawal: "What happens when you switch something off",
      changes: "Changes to this policy",
      contact: "Contact",
    },
    sections: {
      "what-are-cookies": ({ q, settings }) => [
        "<p>Cookies are small text files that a website saves in your browser. Websites can also keep information in other places on your device: local storage, session storage, IndexedDB, caches and service workers. In this policy, &ldquo;cookies&rdquo; means all of these.</p>",
        "<p>Some last only while your browser or tab is open (&ldquo;session&rdquo;). Others stay for a set time, or until you remove them. Some are set by us (first party) and some by another company whose service we use (third party).</p>",
        `<p>The tables on this page are generated from our own list of everything the website can store on your device, the same list that ${q(settings)} uses, so the two always match.</p>`,
      ],
      "strictly-necessary": ({ q, settings, tables }) => [
        `<p>These are needed to run the site and keep it secure, for example to sign you in and protect your forms. They can&rsquo;t be switched off in ${q(settings)}, and we don&rsquo;t need your permission to use them.</p>`,
        ...tables.necessary,
      ],
      "click-only": ({ q, settings, media, rememberMe, tables }) => [
        "<p>Some features start only when you ask for them. Nothing in this section loads, or is saved, just because you opened a page:</p>",
        "<ul>",
        "<li><strong>Sign in with Google.</strong> Google&rsquo;s sign-in tool loads only after you choose to continue with Google. While its sign-in window is open, Google may set its own cookies, and Google&rsquo;s privacy policy applies.</li>",
        "<li><strong>Spam check (captcha).</strong> When you send a form that needs protecting from bots, such as asking for a code to apply for a job without an account, we load Google reCAPTCHA. It does not load when you only view a page. Google may set its own cookie and receives information from your browser, and Google&rsquo;s privacy policy applies.</li>",
        `<li><strong>Videos from YouTube.</strong> A video loads only after you press Play on it, or if you have switched on ${q(media)} in ${q(settings)}. See &ldquo;Videos from YouTube&rdquo; below.</li>`,
        "<li><strong>Installed app and notifications.</strong> The service worker and cache that let the app work offline are set up only after you choose to install the app or turn on notifications.</li>",
        `<li><strong>Your own tasks.</strong> Your email address is remembered only if you tick ${q(rememberMe)}, and unfinished work, such as an AI chat or a job post draft, is kept in a tab only because you started it.</li>`,
        "</ul>",
        "<p>Everything saved or loaded this way:</p>",
        ...tables.clickOnly,
      ],
      "display-settings": ({ q, settings, preferences, rejectAll, tables }) => [
        "<p>These remember how you like the site to look and work: your language, display currency, accessibility settings and layout choices, such as tips you have closed.</p>",
        `<p><strong>We remember these unless you object.</strong> We don&rsquo;t ask first, because they only change how the site looks and works for you. You can object at any time: open ${q(settings)} and switch off ${q(preferences)}, or choose ${q(rejectAll)} on the cookie banner.</p>`,
        "<p>If you object, your settings last for this visit only, and the ones already saved on this device are removed.</p>",
        ...tables.display,
      ],
      media: ({ q, settings, media, acceptAll, h, tables }) => [
        "<p>Videos are off unless you choose them. Until then you see a placeholder instead of the video, and your browser sends nothing to YouTube.</p>",
        `<p>You can choose in two ways: press Play on a video (only that video loads), or switch on ${q(media)} in ${q(settings)} (or choose ${q(acceptAll)} on the cookie banner) so that videos load as you browse.</p>`,
        `<p>A video loads from YouTube&rsquo;s privacy-enhanced address (youtube-nocookie.com). When it does, YouTube (Google) receives information from your browser, such as your IP address, and may set its own cookies. Google&rsquo;s privacy policy applies. <a href="${GOOGLE_CONTROLS_URL}" target="_blank" rel="noopener noreferrer">${h.googleControls}</a>.</p>`,
        ...tables.media,
      ],
      "no-analytics": () => [
        `<p><strong>${NO_ANALYTICS_SENTENCE.en}</strong></p>`,
        "<p>The cookies and storage that we set ourselves are not used to measure how you use the site, to build a profile of you or to show you adverts. We do count, on our own server, how many signed-in people have opened a job, so that employers can see their views; that puts nothing on your device.</p>",
        "<p>If we ever start using analytics or advertising cookies, we will update this page first and ask for your permission before setting them.</p>",
      ],
      "change-your-choice": ({ q, settings, lifetime }) => [
        `<p>You can change your choice at any time. Open ${q(settings)} from the link in the footer of our public pages, or from your account menu when you are signed in, then switch each choice on or off and save. Changes take effect straight away. Your choice applies to this browser only. We ask you again after ${lifetime}.</p>`,
        `<p>We keep a simple record of each choice you make (the date, what you chose and the wording you were shown) under the reference shown in ${q(settings)}, so that we can show what you agreed to. If you are signed in, your choice is also saved to your account.</p>`,
        "<p>You can also delete or block cookies in your browser settings. If you block the strictly necessary ones, you will not be able to sign in.</p>",
      ],
      withdrawal: ({ h, copy }) => [
        "<p>Switching a choice off takes effect straight away. Some things can&rsquo;t be undone, and we say so here.</p>",
        ...copy.table(copy.withdrawalColumns, [
          [
            `<strong>${h.preferences}</strong>`,
            "We stop remembering your settings. They last for this visit only.",
            "The language and accessibility cookies, and the display settings saved in local storage. The accessibility cookie is replaced by one that ends with your visit.",
            "Nothing. These settings are only used to show the site the way you set it.",
          ],
          [
            `<strong>${h.media}</strong>`,
            "Videos stop loading, and any video on the page goes back to a placeholder.",
            "The video player is taken off the page. We store nothing of our own for videos.",
            `What YouTube (Google) already received when a video played, such as your IP address. <a href="${GOOGLE_CONTROLS_URL}" target="_blank" rel="noopener noreferrer">${h.googleControls}</a>.`,
          ],
          [
            `<strong>${copy.installedApp}</strong>`,
            "The app stops working offline, and notifications stop.",
            "The service worker, the site files it saved (up to 30 days of scripts and images), and your notification subscription on our server.",
            "Nothing.",
          ],
        ]),
      ],
      changes: () => [
        "<p>We may update this Cookie Policy when our use of cookies changes, or the law does. We will post updates on this page and change the &ldquo;last updated&rdquo; date at the top. When a change affects what we ask you to agree to, we will ask you again.</p>",
      ],
      contact: () => [
        `<p>Questions about cookies or this policy? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or write to ${COMPANY_ADDRESS}.</p>`,
      ],
    },
  },

  ar: {
    quotes: ["«", "»"],
    columns: ["الاسم", "النوع", "الغرض", "المدة", "الجهة", "الأساس"],
    withdrawalColumns: ["الخيار", "ما يتوقف فورًا", "ما يُزال من جهازك", "ما لا يمكن التراجع عنه"],
    kinds: {
      cookie: "ملف تعريف ارتباط",
      localStorage: "تخزين محلي",
      sessionStorage: "تخزين الجلسة",
      indexedDB: "IndexedDB",
      cacheStorage: "ذاكرة تخزين مؤقت",
      serviceWorker: "عامل خدمة (Service Worker)",
      thirdPartyHost: "خادم يتصل به متصفحك",
    },
    parties: { first: "طرف أول (نحن)", third: "طرف ثالث (شركة أخرى)" },
    bases: {
      appearance: "إعداد عرض (يُحفظ ما لم تعترض)",
      consent: "إذنك",
      "user-action": "بطلب منك",
    },
    durations: {
      "session / up to 3 days": "مدة الجلسة، أو حتى 3 أيام",
      session: "مدة الجلسة",
      "2 hours": "ساعتان",
      "30 minutes": "30 دقيقة",
      "6 months": "6 أشهر",
      "until sign-out": "حتى تسجّل الخروج",
      "until removed": "حتى تحذفه",
      "until removed (this visit only if you object)": "حتى تحذفه، أو لهذه الزيارة فقط إذا اعترضت",
      tab: "حتى تغلق علامة التبويب",
      "none (held in memory only)": "لا شيء يُحفظ (يبقى في الذاكرة فقط)",
      "deleted on the next full page load": "تُحذف عند التحميل الكامل التالي للصفحة",
      "per Google": "حسب ما تحدده Google",
      "until uninstalled": "حتى تزيل التطبيق",
      "until notifications/app removed": "حتى توقف الإشعارات أو تزيل التطبيق",
      "up to 30 days, static assets only": "حتى 30 يومًا (ملفات الموقع فقط)",
      "with SW": "ما دام التطبيق المثبّت قائمًا",
      "n/a": "لا ينطبق",
      "12 months": "12 شهرًا",
      "12 months (session if not allowed)": "12 شهرًا، أو لهذه الزيارة فقط إذا اعترضت",
    },
    wildcardNotes: {
      suffix: "الاسم الذي ينتهي بـ * يشمل مجموعة من الأسماء تبدأ بالطريقة نفسها.",
      subdomain: "والاسم الذي يبدأ بـ *. يشمل أي عنوان تحت ذلك النطاق.",
    },
    installedApp: "التطبيق المثبّت والإشعارات",
    titles: {
      "what-are-cookies": "ما المقصود بملفات تعريف الارتباط والتقنيات المشابهة",
      "strictly-necessary": "الضرورية للغاية",
      "click-only": "أشياء لا تُحمَّل إلا عند النقر",
      "display-settings": "إعدادات العرض",
      media: "مقاطع الفيديو من YouTube",
      "no-analytics": "التحليلات والإعلانات",
      "change-your-choice": "كيف تغيّر اختيارك",
      withdrawal: "ماذا يحدث عند إيقاف أحد الخيارات",
      changes: "التغييرات على هذه السياسة",
      contact: "التواصل",
    },
    sections: {
      "what-are-cookies": ({ q, settings }) => [
        "<p>ملفات تعريف الارتباط هي ملفات نصية صغيرة يحفظها الموقع في متصفحك. ويمكن للمواقع أيضًا حفظ معلومات في أماكن أخرى على جهازك: التخزين المحلي، وتخزين الجلسة، وقاعدة بيانات IndexedDB، وذاكرات التخزين المؤقت، وعوامل الخدمة (Service Workers). وفي هذه السياسة تعني عبارة «ملفات تعريف الارتباط» كل ما سبق.</p>",
        "<p>يستمر بعضها ما دام المتصفح أو علامة التبويب مفتوحًا («الجلسة»)، ويبقى بعضها الآخر لمدة محددة أو إلى أن تزيله. ويكون بعضها من وضعنا نحن (طرف أول)، وبعضها من وضع شركة أخرى نستخدم خدمتها (طرف ثالث).</p>",
        `<p>تُنشأ الجداول في هذه الصفحة من قائمتنا الخاصة بكل ما يمكن للموقع حفظه على جهازك، وهي القائمة نفسها التي تعتمد عليها ${q(settings)}، لذا يتطابق الاثنان دائمًا.</p>`,
      ],
      "strictly-necessary": ({ q, settings, tables }) => [
        `<p>هذه لازمة لتشغيل الموقع والحفاظ على أمانه، مثل تسجيل دخولك وحماية النماذج. ولا يمكن إيقافها من ${q(settings)}، ولا نحتاج إلى إذنك لاستخدامها.</p>`,
        ...tables.necessary,
      ],
      "click-only": ({ q, settings, media, rememberMe, tables }) => [
        "<p>بعض الميزات لا تبدأ إلا عندما تطلبها. لا يُحمَّل شيء من هذا القسم ولا يُحفظ لمجرد فتحك صفحة:</p>",
        "<ul>",
        "<li><strong>تسجيل الدخول عبر Google.</strong> لا تُحمَّل أداة تسجيل الدخول من Google إلا بعد أن تختار المتابعة باستخدام Google. وأثناء فتح نافذة تسجيل الدخول قد تضع Google ملفات تعريف ارتباط خاصة بها، وتنطبق سياسة الخصوصية الخاصة بـ Google.</li>",
        "<li><strong>التحقق من الرسائل المزعجة (كابتشا).</strong> عند إرسال نموذج يحتاج إلى حماية من البرامج الآلية، مثل طلب رمز للتقديم على وظيفة دون حساب، نحمّل Google reCAPTCHA. ولا يُحمَّل عند الاكتفاء بعرض الصفحة. وقد تضع Google ملف تعريف ارتباط خاصًا بها وتتلقى معلومات من متصفحك، وتنطبق سياسة الخصوصية الخاصة بـ Google.</li>",
        `<li><strong>مقاطع الفيديو من YouTube.</strong> لا يُحمَّل المقطع إلا بعد أن تضغط «تشغيل» عليه، أو إذا فعّلت ${q(media)} في ${q(settings)}. انظر قسم «مقاطع الفيديو من YouTube» أدناه.</li>`,
        "<li><strong>التطبيق المثبّت والإشعارات.</strong> لا يُنشأ عامل الخدمة وذاكرة التخزين المؤقت اللذان يتيحان عمل التطبيق دون اتصال إلا بعد أن تختار تثبيت التطبيق أو تفعيل الإشعارات.</li>",
        `<li><strong>مهامك الخاصة.</strong> لا يُحفظ بريدك الإلكتروني إلا إذا اخترت ${q(rememberMe)}، ولا يُحتفظ بالعمل غير المكتمل، مثل محادثة الذكاء الاصطناعي أو مسودة إعلان وظيفة، في علامة التبويب إلا لأنك بدأته.</li>`,
        "</ul>",
        "<p>كل ما يُحفظ أو يُحمَّل بهذه الطريقة:</p>",
        ...tables.clickOnly,
      ],
      "display-settings": ({ q, settings, preferences, rejectAll, tables }) => [
        "<p>تحفظ هذه الإعدادات الطريقة التي تفضّل أن يظهر ويعمل بها الموقع: لغتك وعملة العرض وإعدادات إمكانية الوصول وخيارات التخطيط، مثل التلميحات التي أغلقتها.</p>",
        `<p><strong>نتذكّر هذه الإعدادات ما لم تعترض.</strong> لا نطلب إذنك أولًا لأنها تغيّر فقط طريقة ظهور الموقع وعمله لك. ويمكنك الاعتراض في أي وقت: افتح ${q(settings)} وأوقف ${q(preferences)}، أو اختر ${q(rejectAll)} في شريط ملفات تعريف الارتباط.</p>`,
        "<p>عند الاعتراض تبقى إعداداتك لهذه الزيارة فقط، وتُحذف الإعدادات المحفوظة مسبقًا على هذا الجهاز.</p>",
        ...tables.display,
      ],
      media: ({ q, settings, media, acceptAll, h, tables }) => [
        "<p>مقاطع الفيديو متوقفة ما لم تختر تشغيلها. وإلى ذلك الحين يظهر عنصر بديل بدل المقطع، ولا يرسل متصفحك أي شيء إلى YouTube.</p>",
        `<p>يمكنك الاختيار بطريقتين: اضغط «تشغيل» على المقطع (فيُحمَّل ذلك المقطع وحده)، أو فعّل ${q(media)} في ${q(settings)} (أو اختر ${q(acceptAll)} في شريط ملفات تعريف الارتباط) لتُحمَّل المقاطع أثناء التصفح.</p>`,
        `<p>يُحمَّل المقطع من عنوان YouTube المعزَّز للخصوصية (youtube-nocookie.com). وعندئذ يتلقى YouTube (التابع لشركة Google) معلومات من متصفحك، مثل عنوان IP الخاص بك، وقد يضع ملفات تعريف ارتباط خاصة به. وتنطبق سياسة الخصوصية الخاصة بـ Google. <a href="${GOOGLE_CONTROLS_URL}" target="_blank" rel="noopener noreferrer">${h.googleControls}</a>.</p>`,
        ...tables.media,
      ],
      "no-analytics": () => [
        `<p><strong>${NO_ANALYTICS_SENTENCE.ar}</strong></p>`,
        "<p>ملفات تعريف الارتباط والتخزين التي نضعها نحن لا تُستخدم لقياس كيفية استخدامك للموقع، ولا لبناء ملف عنك، ولا لعرض إعلانات عليك. ونحن نحصي على خادمنا الخاص عدد الأشخاص المسجّلين الدخول الذين فتحوا وظيفة ما، ليرى أصحاب العمل عدد المشاهدات؛ ولا يُحفظ شيء على جهازك بسبب ذلك.</p>",
        "<p>وإذا بدأنا يومًا في استخدام ملفات تعريف ارتباط للتحليلات أو الإعلانات، فسنحدّث هذه الصفحة أولًا ونطلب إذنك قبل وضعها.</p>",
      ],
      "change-your-choice": ({ q, settings, lifetime }) => [
        `<p>يمكنك تغيير اختيارك في أي وقت. افتح ${q(settings)} من الرابط الموجود في أسفل صفحاتنا العامة، أو من قائمة حسابك عند تسجيل الدخول، ثم فعّل كل خيار أو أوقفه واحفظ. تسري التغييرات فورًا، وينطبق اختيارك على هذا المتصفح فقط. ونسألك من جديد بعد ${lifetime}.</p>`,
        `<p>نحتفظ بسجل بسيط لكل اختيار تقوم به (التاريخ، وما اخترته، والنص الذي عُرض عليك) تحت الرقم المرجعي الظاهر في ${q(settings)}، لنتمكن من إثبات ما وافقت عليه. وإذا كنت مسجّل الدخول، يُحفظ اختيارك أيضًا في حسابك.</p>`,
        "<p>يمكنك أيضًا حذف ملفات تعريف الارتباط أو حظرها من إعدادات متصفحك. وإذا حظرت الضرورية منها فلن تتمكن من تسجيل الدخول.</p>",
      ],
      withdrawal: ({ h, copy }) => [
        "<p>يسري إيقاف أي خيار فورًا. وبعض الأمور لا يمكن التراجع عنها، ونذكرها هنا.</p>",
        ...copy.table(copy.withdrawalColumns, [
          [
            `<strong>${h.preferences}</strong>`,
            "نتوقف عن تذكّر إعداداتك، وتبقى لهذه الزيارة فقط.",
            "ملفا اللغة وإمكانية الوصول، وإعدادات العرض المحفوظة في التخزين المحلي. ويُستبدل ملف إمكانية الوصول بآخر ينتهي بنهاية زيارتك.",
            "لا شيء. تُستخدم هذه الإعدادات فقط لعرض الموقع بالطريقة التي اخترتها.",
          ],
          [
            `<strong>${h.media}</strong>`,
            "تتوقف مقاطع الفيديو عن التحميل، ويعود أي مقطع في الصفحة إلى عنصر بديل.",
            "تُزال أداة تشغيل الفيديو من الصفحة. ولا نحفظ شيئًا من جانبنا بسبب مقاطع الفيديو.",
            `ما تلقّاه YouTube (التابع لشركة Google) بالفعل عند تشغيل مقطع، مثل عنوان IP الخاص بك. <a href="${GOOGLE_CONTROLS_URL}" target="_blank" rel="noopener noreferrer">${h.googleControls}</a>.`,
          ],
          [
            `<strong>${copy.installedApp}</strong>`,
            "يتوقف التطبيق عن العمل دون اتصال، وتتوقف الإشعارات.",
            "عامل الخدمة، وملفات الموقع التي حفظها (حتى 30 يومًا من السكربتات والصور)، واشتراكك في الإشعارات لدينا على الخادم.",
            "لا شيء.",
          ],
        ]),
      ],
      changes: () => [
        "<p>قد نحدّث سياسة ملفات تعريف الارتباط هذه عندما يتغيّر استخدامنا لها أو يتغيّر القانون. سننشر التحديثات في هذه الصفحة ونغيّر تاريخ «آخر تحديث» في أعلاها. وعندما يؤثر التغيير فيما نطلب موافقتك عليه، سنسألك من جديد.</p>",
      ],
      contact: () => [
        `<p>لأي أسئلة حول ملفات تعريف الارتباط أو هذه السياسة، راسلنا على <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> أو اكتب إلى ${COMPANY_ADDRESS}.</p>`,
      ],
    },
  },
};

// ─── Building blocks ────────────────────────────────────────────────────────

function fail(message) {
  throw new Error(`cookie policy: ${message}`);
}

/** A string at a dotted path in the messages, or a clear error naming the path. */
function message(messages, dotted) {
  const value = dotted.split(".").reduce((node, key) => (node == null ? undefined : node[key]), messages);
  if (typeof value !== "string" || value.trim() === "") fail(`messages is missing "${dotted}"`);
  return value;
}

/** Table lines: a scrolling wrapper, a header row, one row per entry. Cells are HTML already. */
function table(headers, rows) {
  const cells = (tag, cls, values) => `<tr>${values.map((value) => `<${tag} class="${cls}">${value}</${tag}>`).join("")}</tr>`;
  return [
    `<div class="${TABLE_WRAP_CLASS}">`,
    `<table class="${TABLE_CLASS}">`,
    "<thead>",
    cells("th", TH_CLASS, headers),
    "</thead>",
    "<tbody>",
    ...rows.map((row) => cells("td", TD_CLASS, row)),
    "</tbody>",
    "</table>",
    "</div>",
  ];
}

/** Which table a row belongs to. Every row lands in exactly one. */
function placeOf(row) {
  if (row.basis === "user-action") return "clickOnly";
  if (row.category === "necessary") return "necessary";
  if (row.category === "preferences") return "display";
  return "media"; // validated: the only category left
}

function validateRegistry(registry) {
  if (!Array.isArray(registry) || registry.length === 0) fail("the registry is empty");
  for (const row of registry) {
    const label = `registry row "${row && row.name}"`;
    if (!row || typeof row.name !== "string" || row.name === "") fail("a registry row has no name");
    if (!ALLOWED_CATEGORIES.includes(row.category)) {
      fail(
        `${label} has category "${row.category}", but this policy only has text for ${ALLOWED_CATEGORIES.join(", ")}. ` +
          `Rewrite the policy (and drop "${NO_ANALYTICS_SENTENCE.en}" if it is no longer true) before generating it.`,
      );
    }
    if (!KINDS.includes(row.kind)) fail(`${label} has kind "${row.kind}", which the policy has no wording for`);
    if (!BASES.includes(row.basis)) fail(`${label} has basis "${row.basis}", which the policy has no wording for`);
    if (!PARTIES.includes(row.party)) fail(`${label} has party "${row.party}", which the policy has no wording for`);
    if (!ALLOWED_PAIRS[row.category].includes(row.basis)) {
      const pairs = Object.entries(ALLOWED_PAIRS).flatMap(([category, bases]) => bases.map((basis) => `${category} + ${basis}`));
      fail(
        `${label} has basis "${row.basis}" under category "${row.category}", but this policy's text is only true for ${pairs.join(", ")}. ` +
          `Rewrite the affected section (what it says about permission follows the basis) before generating it.`,
      );
    }
  }
}

// ─── The policy ─────────────────────────────────────────────────────────────

/**
 * @param {{
 *   registry: Array<{ name: string, kind: string, category: string, basis: string, party: string, duration: string, purposeKey: string }>,
 *   messages: Record<string, any>,
 *   locale: "en" | "ar",
 * }} input registry rows (registry.json), one locale's messages file, and the locale
 * @returns {string} the page body as HTML, sections separated by a blank line
 */
export function buildCookiePolicy({ registry, messages, locale }) {
  const copy = COPY[locale];
  if (!copy || !COOKIE_POLICY_LOCALES.includes(locale)) fail(`unknown locale "${locale}" (expected ${COOKIE_POLICY_LOCALES.join(" or ")})`);
  validateRegistry(registry);

  const text = (dotted) => escapeHtml(message(messages, dotted));
  const [open, close] = copy.quotes;
  const basisLabels = { ...copy.bases, "strictly-necessary": text("consent.settings.necessaryTitle") };

  const durationLabel = (row) => {
    if (!Object.hasOwn(copy.durations, row.duration)) {
      fail(`no ${locale} wording for duration "${row.duration}" (registry row "${row.name}"); add it to scripts/lib/cookiePolicyFromRegistry.mjs`);
    }
    return copy.durations[row.duration];
  };

  // [LEGAL] D4: how long a cookie choice lasts is the choice cookie's own duration in the registry.
  const choiceRow = registry.find((row) => row.name === "mpl_consent");
  if (!choiceRow || !/^\d+ months$/.test(choiceRow.duration)) {
    fail(
      `the registry row "mpl_consent" must exist with a duration in whole months (found ${choiceRow ? `"${choiceRow.duration}"` : "none"}); ` +
        'the "We ask you again after ..." sentence is built from it',
    );
  }

  const rowCells = (row) => {
    const duration = durationLabel(row);
    return [
      `<code>${escapeHtml(row.name)}</code>`,
      copy.kinds[row.kind],
      text(`consent.items.${row.purposeKey}`),
      duration,
      copy.parties[row.party],
      basisLabels[row.basis],
    ];
  };

  const groups = { necessary: [], clickOnly: [], display: [], media: [] };
  for (const row of registry) groups[placeOf(row)].push(row);
  for (const [group, rows] of Object.entries(groups)) {
    if (rows.length === 0) fail(`the registry has no "${group}" rows, so that section's text no longer matches it; rewrite the section before generating`);
  }

  // Explain the * only where a table has one, and only the kind it has.
  const wildcardNote = (rows) => {
    const notes = [];
    if (rows.some((row) => row.name.endsWith("*"))) notes.push(copy.wildcardNotes.suffix);
    if (rows.some((row) => row.name.startsWith("*."))) notes.push(copy.wildcardNotes.subdomain);
    return notes.length ? [`<p>${notes.join(" ")}</p>`] : [];
  };

  const tableFor = (rows) => [...table(copy.columns, rows.map(rowCells)), ...wildcardNote(rows)];

  const context = {
    q: (value) => `${open}${escapeHtml(value)}${close}`,
    // Raw labels (q() escapes them) ...
    settings: message(messages, "consent.settings.title"),
    preferences: message(messages, "consent.settings.preferencesTitle"),
    media: message(messages, "consent.settings.mediaTitle"),
    rejectAll: message(messages, "landing.cookieRejectAll"),
    acceptAll: message(messages, "landing.cookieAcceptAll"),
    rememberMe: message(messages, "auth.rememberMe"),
    lifetime: durationLabel(choiceRow),
    // ... and the same labels already escaped, for sections that print them bare.
    h: {
      preferences: text("consent.settings.preferencesTitle"),
      media: text("consent.settings.mediaTitle"),
      googleControls: text("consent.settings.mediaGoogleControls"),
    },
    tables: {
      necessary: tableFor(groups.necessary),
      clickOnly: tableFor(groups.clickOnly),
      display: tableFor(groups.display),
      media: tableFor(groups.media),
    },
    copy: { ...copy, table },
  };

  const sections = COOKIE_POLICY_SECTION_IDS.map((id, index) => {
    const body = copy.sections[id];
    if (!body) fail(`no ${locale} text for section "${id}"`);
    return [`<h2 id="${id}">${index + 1}. ${copy.titles[id]}</h2>`, ...body(context)].join("\n");
  }).join("\n\n");
  return `<!-- ${GENERATED_POLICY_MARKER} -->\n${sections}`;
}
