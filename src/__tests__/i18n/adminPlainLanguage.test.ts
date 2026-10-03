/** @jest-environment node */

/**
 * The admin WhatsApp page and the email part of /admin/settings are used by business admins, not
 * developers. Setup details (env keys, restarts, callback URLs, tokens) live in docs/DEPLOYMENT.md.
 */
const en = require("../../../messages/en.json") as Record<string, Record<string, string>>;
const ar = require("../../../messages/ar.json") as Record<string, Record<string, string>>;

/** The adminSettings keys of the email part of the page (the keys this project added, plus the SMTP block they sit with). */
const EMAIL_SETTINGS_KEYS = [
  "emailDeliveryTitle", "emailDeliveryDescription", "emailProviderLabel", "emailProviderSmtp", "emailProviderSes", "emailProviderSmtpNote",
  "emailProviderNotChosen", "sesSectionTitle", "sesSetupHelp", "sesRegionLabel", "sesRegionPlaceholder", "sesRegionInvalid", "sesAccessKeyIdLabel",
  "sesSecretAccessKeyLabel", "sesSecretHelp", "sesSecretRequired", "sesFromEmailLabel", "sesFromNameLabel", "sesConfigurationSetLabel",
  "sesConfigurationSetHelp", "sesIncompleteWarning", "smtpSectionTitle", "emailConfigDescription", "smtpEmailLabel", "smtpEmailPlaceholder",
  "appPasswordLabel", "appPasswordPlaceholder", "appPasswordHelp", "smtpPasswordRequired", "smtpHostLabel", "smtpHostPlaceholder", "smtpPortLabel",
  "smtpPortPlaceholder", "sslTlsLabel", "testRecipientLabel", "testRecipientHelp", "testEmailButton", "testEmailSending", "testEmailSentTo",
  "testEmailError", "testEmailDetailsTitle", "testEmailEnterPassword", "testEmailProviderReply", "networkError",
] as const;

/**
 * The WhatsApp keys of /admin/communications (the broadcast form). It is the same admin's second WhatsApp screen,
 * so it must use the same words as the WhatsApp page ("blanks" and "placeholders").
 */
const COMMUNICATIONS_KEYS = ["whatsappParamLabel", "whatsappParamsRequired", "whatsappMessageLimitNote", "whatsappTokensHelp"] as const;

const FORBIDDEN: Array<[string, RegExp]> = [
  [".env", /\.env\b/i],
  ["WHATSAPP_", /WHATSAPP_/],
  ["SES_", /SES_/],
  ["EMAIL_PROVIDER", /EMAIL_PROVIDER/],
  ["restart the server", /restart the server/i],
  ["mock", /mock/i],
  ["cron", /cron/i],
  ["callback", /callback/i],
  ["webhook", /webhook/i],
  ["verify token", /verify token/i],
  ["access token", /access token/i],
  ["endpoint", /endpoint/i],
  ["API", /\bAPI\b/],
  ["Graph", /\bGraph\b/],
  ["E.164", /E\.164/],
  ["IAM", /\bIAM\b/],
  ["ARN", /\bARN\b/],
  ["sandbox", /sandbox/i],
  ["Nodemailer", /nodemailer/i],
  ["2FA", /\b2FA\b/i],
];

/**
 * The same jargon in Arabic. The Latin list above cannot see it: an Arabic-only regression such as
 * "وضع المحاكاة" would pass. Each pattern also covers the obvious variants (definite article, plural,
 * إعادة/أعد), and "معامل" is the developer word for a template slot ("parameter"): the copy says "فراغ".
 */
const FORBIDDEN_AR: Array<[string, RegExp, string[]]> = [
  ["وضع المحاكاة (mock mode)", /محاكا/, ["وضع المحاكاة", "المحاكاة", "محاكاة"]],
  ["أعد تشغيل الخادم (restart the server)", /(?:أعد|اعد|إعادة|اعادة)\s+تشغيل/, ["أعد تشغيل الخادم", "إعادة تشغيل الخادم", "أعد تشغيل السيرفر"]],
  ["نقاط نهاية (endpoints)", /نق(?:اط|طة)\s+(?:ال)?نهاي/, ["نقاط نهاية", "نقطة نهاية", "نقاط النهاية", "نقطة النهاية"]],
  ["واجهة برمجة (API)", /واجهة\s+(?:ال)?برمجة/, ["واجهة برمجة التطبيقات", "واجهة البرمجة"]],
  // "رمز الدخول" (a login code, the plain name of the Login code category) is fine; "رمز الوصول" is the access token.
  ["رمز الوصول (access token)", /ر(?:مز|موز)\s+(?:ال)?وصول/, ["رمز الوصول", "رموز الوصول", "رمز وصول"]],
  ["توكن (token)", /توكن/, ["توكن", "التوكن"]],
  ["معامل (parameter)", /معامل/, ["معامل", "المعامل", "معاملات", "المعاملات"]],
  ["ويب هوك (webhook)", /ويب\s*هوك/, ["ويب هوك", "ويبهوك"]],
  ["كرون (cron)", /كرون/, ["كرون", "كرون جوب"]],
  ["ساندبوكس (sandbox)", /ساندبوكس|صندوق\s+(?:ال)?رمل/, ["ساندبوكس", "الصندوق الرملي"]],
];

type Entry = { where: string; text: string };
const entries = (messages: Record<string, Record<string, string>>, locale: string): Entry[] => [
  ...Object.entries(messages.adminWhatsApp).map(([k, text]) => ({ where: `${locale} adminWhatsApp.${k}`, text })),
  ...EMAIL_SETTINGS_KEYS.map((k) => ({ where: `${locale} adminSettings.${k}`, text: messages.adminSettings[k] })),
  ...COMMUNICATIONS_KEYS.map((k) => ({ where: `${locale} adminCommunications.${k}`, text: messages.adminCommunications[k] })),
];

describe("admin WhatsApp and email settings speak plain language", () => {
  it("lists only email and communications keys that exist in both locales", () => {
    for (const k of EMAIL_SETTINGS_KEYS) {
      expect([k, typeof en.adminSettings[k]]).toEqual([k, "string"]);
      expect([k, typeof ar.adminSettings[k]]).toEqual([k, "string"]);
    }
    for (const k of COMMUNICATIONS_KEYS) {
      expect([k, typeof en.adminCommunications[k]]).toEqual([k, "string"]);
      expect([k, typeof ar.adminCommunications[k]]).toEqual([k, "string"]);
    }
  });

  it.each([
    ["en", en, FORBIDDEN],
    ["ar", ar, [...FORBIDDEN, ...FORBIDDEN_AR.map(([term, re]): [string, RegExp] => [term, re])]],
  ] as const)("no %s string names developer setup or jargon", (locale, messages, forbidden) => {
    const hits = entries(messages, locale).flatMap(({ where, text }) =>
      forbidden.filter(([, re]) => re.test(text)).map(([term]) => `${where}: "${term}"`),
    );
    expect(hits).toEqual([]);
  });

  // A guard that matches nothing passes forever: pin each Arabic pattern to the phrases it is meant to catch.
  it.each(FORBIDDEN_AR)("the Arabic jargon pattern for %s catches its phrases", (_term, re, samples) => {
    for (const sample of samples) expect([sample, re.test(sample)]).toEqual([sample, true]);
  });

  it("calls the {{…}} fill-ins placeholders and the template slots blanks, never tokens or parameters", () => {
    // ICU arguments such as {token} are code, not copy.
    const words = entries(en, "en")
      .map(({ where, text }) => ({ where, text: text.replace(/\{\w+\}/g, "") }))
      .filter(({ text }) => /\btokens?\b|parameter/i.test(text))
      .map(({ where }) => where);
    expect(words).toEqual([]);
    for (const key of ["tokensHelp", "scheduleTokensHelp", "scheduleParamUnknownToken"]) expect(en.adminWhatsApp[key]).toMatch(/placeholder/i);
    expect(en.adminCommunications.whatsappTokensHelp).toMatch(/placeholder/i);
  });

  it("uses the WhatsApp page's word for a template slot on the broadcast form too", () => {
    expect(en.adminCommunications.whatsappParamLabel).toBe(en.adminWhatsApp.paramPlaceholder);
    expect(en.adminCommunications.whatsappParamLabel).toBe("Blank {index}");
    expect(en.adminCommunications.whatsappParamsRequired).toMatch(/\bblank\b/);
    expect(en.adminCommunications.whatsappMessageLimitNote).toMatch(/\bblank\b/);
    expect(ar.adminCommunications.whatsappParamLabel).toBe(ar.adminWhatsApp.paramPlaceholder);
  });

  it("names Meta's category beside the plain one on the starter cards, with the Arabic Latin name isolated", () => {
    expect(en.adminWhatsApp.starterCategoryUtility).toMatch(/^Service update \(choose .Utility. in Meta Business Manager\)$/);
    expect(en.adminWhatsApp.starterCategoryMarketing).toMatch(/^Marketing \(choose .Marketing. in Meta Business Manager\)$/);
    expect(ar.adminWhatsApp.starterCategoryUtility).toContain("⁦Utility⁩");
    expect(ar.adminWhatsApp.starterCategoryMarketing).toContain("⁦Marketing⁩");
  });

  // Unisolated, a Latin token inside right-to-left text reorders its punctuation ("'{{firstName}}'", "+971…").
  it("isolates every placeholder, START/STOP and phone example inside the Arabic WhatsApp copy", () => {
    const loose = [...Object.entries(ar.adminWhatsApp), ["adminCommunications.whatsappTokensHelp", ar.adminCommunications.whatsappTokensHelp] as const]
      .map(([k, text]) => ({ k, rest: text.replace(/⁦[^⁩]*⁩/g, "") }))
      .filter(({ rest }) => /\{\{|\bSTART\b|\bSTOP\b|\+971/.test(rest))
      .map(({ k }) => k);
    expect(loose).toEqual([]);
  });

  it("keeps the ICU quoting of the {{…}} examples, so they render as written", () => {
    for (const messages of [en, ar]) {
      for (const key of ["tokensHelp", "scheduleTokensHelp", "starterHelp"]) {
        expect(messages.adminWhatsApp[key]).toContain("'{{");
        expect(messages.adminWhatsApp[key]).not.toMatch(/(^|[^'])\{\{/);
      }
    }
  });
});
