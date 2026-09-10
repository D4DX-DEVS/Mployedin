/**
 * Re-applies every message key the employer hiring-pipeline work introduced
 * (Shortlist tab, bulk-action email choice, offer modal, Background Checks tab).
 *
 * Concurrent sessions rewrite messages/*.json wholesale and drop keys that were
 * added since they last read the file — next-intl then throws MISSING_MESSAGE
 * and takes the page down. This applier is idempotent: run it after any locale
 * clobber. Existing values are never overwritten.
 *
 *   node scripts/i18n-patch-employer-pipeline.mjs          # apply
 *   node scripts/i18n-patch-employer-pipeline.mjs --check  # report only, exit 1 if any missing
 */
import fs from "fs";

const KEYS = {
  en: {
    employerJobWorkspace: {
      tabShortlist: "Shortlist",
      shortlistHeading: "Shortlisted candidates",
      shortlistEmpty: "No one shortlisted yet",
      shortlistEmptyDesc: "Shortlist a candidate from Applications and they will appear here.",
      yourCompany: "your company",
      tabChecks: "Background Checks",
      checksHeading: "Background checks for this job",
      checksHint: "Verification runs alongside the pipeline, not as a stage in it.",
      checksEmpty: "No checks raised yet",
      checksEmptyDesc: "Request a reference or background check on any candidate you are seriously considering.",
      checksLoadError: "We couldn't load the checks for this job. Please try again.",
      checksReferences: "{done} of {total} referees replied",
      checksRequested: "Requested {date}",
      checksManage: "Manage",
      resultRunning: "In progress",
      resultClear: "Clear",
      resultFlagged: "Flagged",
      resultFailed: "Failed",
      resultDone: "Completed",
      resultCancelled: "Cancelled",
      journeyCheckRequest: "Request check",
      journeyCheckView: "View check",
    },
    employerApplications: {
      verbShortlist: "shortlist",
      verbSelect: "select",
      verbOffer: "offer",
      verbHire: "hire",
      verbReject: "reject",
      verbSend: "send",
      verbUpdate: "update",
      // `action` is the bulk action's verb, so the button names what it will do.
      confirmWithoutEmail: "{action, select, shortlist {Shortlist} select {Select} offer {Offer} hire {Hire} reject {Reject} send {Send} other {Update}} without email",
      confirmAndEmail: "{action, select, shortlist {Shortlist} select {Select} offer {Offer} hire {Hire} reject {Reject} send {Send} other {Update}} and email {count, plural, one {# candidate} other {# candidates}}",
      resetToDefault: "Reset to default",
      processing: "Working…",
      sending: "Sending…",
      candidateFallback: "the candidate",
      offerCurrency: "Currency",
      offerFailed: "We couldn't create that offer. Please try again.",
      checkChipRunning: "Check running",
      checkChipClear: "Check clear",
      checkChipFlagged: "Check flagged",
      checkChipFailed: "Check failed",
      checkChipDone: "Check done",
      checkChipCancelled: "Check cancelled",
      checkChipRefs: "{done} of {total} referees replied",
      offerCheckPending: "The background check for this candidate is still running. You can still send the offer — make it conditional if you need to.",
      offerCheckFlagged: "The background check for this candidate needs review before you commit. Check the result first.",
    },
    employerBackgroundChecks: {
      unknownCandidate: "Unnamed candidate",
      openCheck: "Open",
    },
    employerOffers: {
      chooseCandidate: "Choose a candidate",
    },
  },
  ar: {
    employerJobWorkspace: {
      tabShortlist: "القائمة المختصرة",
      shortlistHeading: "المرشحون في القائمة المختصرة",
      shortlistEmpty: "لا أحد في القائمة المختصرة بعد",
      shortlistEmptyDesc: "أضف مرشحاً من صفحة الطلبات وسيظهر هنا.",
      yourCompany: "شركتك",
      tabChecks: "التحقق من الخلفية",
      checksHeading: "عمليات التحقق لهذه الوظيفة",
      checksHint: "يجري التحقق بالتوازي مع المسار، وليس كمرحلة ضمنه.",
      checksEmpty: "لم تُطلب أي عملية تحقق بعد",
      checksEmptyDesc: "اطلب التحقق من المراجع أو الخلفية لأي مرشح تفكر فيه جدياً.",
      checksLoadError: "تعذّر تحميل عمليات التحقق لهذه الوظيفة. حاول مرة أخرى.",
      checksReferences: "ردّ {done} من {total} من المُزكّين",
      checksRequested: "طُلب في {date}",
      checksManage: "إدارة",
      resultRunning: "قيد التنفيذ",
      resultClear: "سليم",
      resultFlagged: "يحتاج مراجعة",
      resultFailed: "فشل",
      resultDone: "مكتمل",
      resultCancelled: "ملغى",
      journeyCheckRequest: "اطلب تحققاً",
      journeyCheckView: "عرض التحقق",
    },
    employerApplications: {
      verbShortlist: "إضافة للقائمة المختصرة",
      verbSelect: "اختيار",
      verbOffer: "تقديم عرض",
      verbHire: "توظيف",
      verbReject: "رفض",
      verbSend: "إرسال",
      verbUpdate: "تحديث",
      confirmWithoutEmail: "تأكيد بدون بريد",
      confirmAndEmail: "تأكيد ومراسلة {count, plural, zero {# مرشح} one {مرشح واحد} two {مرشحين} few {# مرشحين} many {# مرشحاً} other {# مرشح}}",
      resetToDefault: "إعادة للنص الافتراضي",
      processing: "جارٍ التنفيذ…",
      sending: "جارٍ الإرسال…",
      candidateFallback: "المرشح",
      offerCurrency: "العملة",
      offerFailed: "تعذّر إنشاء العرض. حاول مرة أخرى.",
      checkChipRunning: "التحقق جارٍ",
      checkChipClear: "التحقق سليم",
      checkChipFlagged: "التحقق يحتاج مراجعة",
      checkChipFailed: "فشل التحقق",
      checkChipDone: "اكتمل التحقق",
      checkChipCancelled: "أُلغي التحقق",
      checkChipRefs: "ردّ {done} من {total} من المُزكّين",
      offerCheckPending: "ما زال التحقق من خلفية هذا المرشح جارياً. يمكنك إرسال العرض على أي حال — واجعله مشروطاً إذا لزم الأمر.",
      offerCheckFlagged: "يحتاج التحقق من خلفية هذا المرشح إلى مراجعة قبل الالتزام. راجع النتيجة أولاً.",
    },
    employerBackgroundChecks: {
      unknownCandidate: "مرشح بلا اسم",
      openCheck: "فتح",
    },
    employerOffers: {
      chooseCandidate: "اختر مرشحاً",
    },
  },
};

const checkOnly = process.argv.includes("--check");
let missing = 0;
let added = 0;

for (const [locale, namespaces] of Object.entries(KEYS)) {
  const file = `messages/${locale}.json`;
  const raw = fs.readFileSync(file, "utf8");
  // Locale files carry mixed line endings across sessions — preserve whatever is there.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const messages = JSON.parse(raw);

  for (const [namespace, keys] of Object.entries(namespaces)) {
    messages[namespace] ??= {};
    for (const [key, value] of Object.entries(keys)) {
      if (messages[namespace][key] !== undefined) continue;
      missing++;
      if (checkOnly) {
        console.log(`missing  ${locale}  ${namespace}.${key}`);
      } else {
        messages[namespace][key] = value;
        added++;
      }
    }
  }

  if (!checkOnly && added > 0) {
    fs.writeFileSync(file, JSON.stringify(messages, null, 2).replace(/\n/g, eol) + eol);
  }
}

if (checkOnly) {
  console.log(missing ? `${missing} key(s) missing — run without --check to restore` : "all keys present");
  process.exit(missing ? 1 : 0);
}
console.log(added ? `restored ${added} key(s)` : "all keys already present");
