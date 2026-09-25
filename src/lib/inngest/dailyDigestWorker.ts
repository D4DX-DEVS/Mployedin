/**
 * Daily Digest Worker — Inngest Function
 *
 * Triggered by "notification/daily-digest" events emitted by the daily
 * recommendations cron. Combines job recommendations + profile views
 * into ONE email per user. Never sends multiple separate emails.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import NotificationPreference from "@/models/NotificationPreference";
import { sendEmail, isUndeliverableAddress } from "@/lib/communications/email";
import { emailHeader, emailFooter } from "@/lib/communications/emailLayout";
import type { NotificationDailyDigestEvent } from "./events";
import { formatCount } from "@/lib/ui/intlFormat";

export const dailyDigestWorker = inngest.createFunction(
  {
    id: "daily-digest-worker",
    name: "Daily Digest Email Worker",
    // A rejected digest used to be retried 3 more times, and each attempt was a
    // fresh Gmail login plus a fresh failed emaillogs row — that is how ~230
    // recipients turned into ~1,200 failures a day once SMTP started refusing.
    // The digest is not worth amplifying: the next daily run covers a blip.
    retries: 1,
    // Inngest free plan caps concurrency at 5 (sync is rejected above that).
    concurrency: { limit: 5 },
    triggers: [{ event: "notification/daily-digest" }],
  },
  async ({ event, step }: { event: { data: NotificationDailyDigestEvent["data"] }; step: any }) => {
    const { userId, email, locale, jobs, profileViews } = event.data;

    await connectDB();

    // A reserved-domain recipient makes sendEmail throw, which Inngest reads as
    // a transient failure and retries. The producer already filters these out;
    // this is the backstop that keeps any other emitter from reopening that
    // retry loop. Returning (rather than throwing) marks the run succeeded.
    if (isUndeliverableAddress(email)) {
      return { sent: false, skipped: "undeliverable recipient", userId };
    }

    // Build and send the combined digest email
    await step.run("send-digest-email", async () => {
      const html = buildDigestEmail(digestEmailDataFromEvent(event.data));

      const jobCount = jobs.length;
      const viewCount = profileViews.count;
      // "No strong matches" would be untrue here: nothing was matched at all,
      // because we don't know where the seeker wants to work.
      const noLocation = event.data.nearMiss?.topBlocker === "no_location";

      // A digest can now also carry only the "nothing cleared the bar" note,
      // in which case both counts are zero and the old subject read
      // "0 recruiters viewed your profile".
      let subject: string;
      if (locale === "ar") {
        subject =
          jobCount > 0 && viewCount > 0
            ? `${jobCount} وظائف جديدة + ${viewCount} مشاهدات لملفك الشخصي`
            : jobCount > 0
              ? `${jobCount} وظائف مطابقة لملفك الشخصي`
              : viewCount > 0
                ? `${viewCount} مسؤولي توظيف شاهدوا ملفك الشخصي`
                : noLocation
                  ? "أضف الدولة المفضلة لتصلك الوظائف المطابقة"
                  : "لا توجد مطابقات قوية هذا الأسبوع";
      } else {
        subject =
          jobCount > 0 && viewCount > 0
            ? `${jobCount} new job matches + ${viewCount} profile views`
            : jobCount > 0
              ? `${jobCount} jobs matching your profile`
              : viewCount > 0
                ? `${viewCount} recruiters viewed your profile`
                : noLocation
                  ? "Add your preferred country to get job matches"
                  : "No strong job matches this week";
      }

      await sendEmail({
        to: email,
        subject,
        html,
        // userId adds the RFC 8058 List-Unsubscribe header — the "Unsubscribe"
        // button Gmail and Yahoo show beside the sender, which they expect on
        // recurring mail. Category + source also stop this logging as a
        // "system / direct" email in the admin email log.
        userId,
        category: "jobs",
        source: "daily-digest",
      });
    });

    // `lastDigestSentAt` is deliberately NOT written here any more. The producer
    // claims it atomically before emitting, so the 23-hour gate closes whether
    // or not this send succeeds. Writing it here as well was the original
    // defect: a failed send skipped this step, left the gate open, and every
    // retry sent again.
    await step.run("update-last-email-timestamp", async () => {
      await NotificationPreference.updateOne(
        { userId },
        { $set: { lastEmailSentAt: new Date() } },
        { upsert: true },
      );
    });

    return { sent: true, userId, jobCount: jobs.length, viewCount: profileViews.count };
  },
);

/**
 * The email-builder input for one digest event.
 *
 * A function of its own so the event → email mapping can be tested. It used to
 * be written inline in the worker, forwarding each field by name — and it
 * forwarded every one except `nearMiss`. The producer computed "your closest
 * match was 37%, here is what is holding you back", claimed the 14-day
 * near-miss cooldown for it, and the worker dropped it: on 2026-09-23 all 187
 * "No strong job matches" emails went out with that subject over a body that
 * never said why. Every builder test passed `nearMiss` in directly, which is
 * why none of them caught it.
 */
export function digestEmailDataFromEvent(
  data: NotificationDailyDigestEvent["data"],
): DigestEmailData {
  return {
    userId: data.userId,
    userName: data.userName,
    locale: data.locale,
    jobs: data.jobs,
    profileViews: data.profileViews,
    profile: data.profile,
    nearMiss: data.nearMiss,
  };
}

export interface DigestEmailData {
  /** The recipient. Signs the footer's unsubscribe link; without it the link is left out. */
  userId?: string;
  userName: string;
  locale: string;
  jobs: Array<{
    jobId: string;
    title: string;
    company: string;
    location: string;
    matchScore: number;
    salary?: { min: number; max: number; currency?: string; period?: string };
    /** The job skills the seeker demonstrably has — the reasoning behind the %. */
    matchedSkills?: string[];
  }>;
  profileViews: {
    count: number;
    viewers: Array<{ name: string; role: string }>;
  };
  /** Omitted for older events still in flight; the block is then skipped. */
  profile?: { completeness: number; signals: number };
  /**
   * Present only when jobs were scored and none cleared the threshold. Turns
   * a silent morning into an explanation the seeker can act on.
   */
  nearMiss?: {
    bestScore: number;
    threshold: number;
    considered: number;
    topBlocker: string | null;
  };
}

function companyInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const LOGO_COLORS = ["#3b82f6", "#059669", "#8b5cf6", "#d97706", "#e11d48", "#0891b2"];

function logoColor(name: string): string {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

const PERIOD_LABEL: Record<string, { en: string; ar: string }> = {
  monthly: { en: "/mo", ar: "/شهر" },
  yearly: { en: "/yr", ar: "/سنة" },
  lpa: { en: "/yr", ar: "/سنة" },
};

/**
 * One salary line, in the job's own currency.
 *
 * Every figure used to be suffixed with a hardcoded "AED" — but only 16 of 62
 * live jobs are priced in dirhams, so an INR annual figure was presented as a
 * dirham amount roughly thirty times too large. The period matters for the
 * same reason: a yearly range rendered bare reads as a monthly one.
 *
 * Returns escaped HTML rather than plain text, because the Arabic form needs
 * the amount isolated from the label — see below. Callers must not escape it
 * again.
 */
function salaryLine(
  salary: { min: number; max: number; currency?: string; period?: string } | undefined,
  isAr: boolean,
): string {
  if (!salary || !(salary.max > 0 || salary.min > 0)) return "";
  const code = (salary.currency ?? "").toUpperCase().trim() || "AED";
  const period = PERIOD_LABEL[salary.period ?? "monthly"] ?? PERIOD_LABEL.monthly;
  const range =
    salary.min > 0 && salary.max > salary.min
      ? `${formatCount(salary.min)}–${formatCount(salary.max)}`
      : formatCount(salary.max > 0 ? salary.max : salary.min);
  // Code before the amount, and the whole thing kept on one line: the old
  // trailing "AED" wrapped onto its own row on a phone.
  const amount = `${code} ${range}`;
  // "INR 40,000–80,000" is Latin, "/شهر" is not. Left as one run inside an
  // Arabic paragraph the bidi algorithm pushes the currency code across to the
  // far side of the label, so the amount is isolated and the label kept out of
  // the isolate. English is unchanged — one escaped string, as before.
  return isAr
    ? `<span dir="ltr">${esc(amount)}</span>${esc(period.ar)}`
    : esc(`${amount}${period.en}`);
}

export function buildDigestEmail(data: DigestEmailData): string {
  const { userName, locale, jobs, profileViews, profile, nearMiss } = data;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";

  /**
   * Escape a value, isolating it as left-to-right when the digest is Arabic.
   *
   * Job titles, company names, cities and skill names are Latin whatever the
   * reader's language, so an Arabic digest is a right-to-left paragraph with
   * left-to-right runs inside it. The bidi algorithm resolves the neutral
   * characters *between* those runs — the colon, the commas, the middot —
   * against the paragraph, not against the run, which is why the skills line
   * rendered as "React, Node.js, MongoDB :مهاراتك المطابقة" with the colon
   * stranded at the wrong end.
   *
   * `dir` on an inline element is the one isolation mechanism Gmail, Outlook
   * and Apple Mail all honour; `unicode-bidi: isolate` is CSS and gets stripped.
   * A no-op for English, so those emails stay byte-identical.
   */
  const bidi = (text: string) => (isAr ? `<span dir="ltr">${esc(text)}</span>` : esc(text));

  const greeting = isAr
    ? `مرحباً <strong>${esc(userName)}</strong>`
    : `Hi <strong>${esc(userName)}</strong>`;

  const jobsTitle = isAr ? "وظائف مطابقة لك" : "Jobs matching your profile";
  const viewsTitle = isAr
    ? "مسؤولو التوظيف شاهدوا ملفك"
    : "Recruiters viewed your profile";

  // The old copy promised "great job matches based on your profile" on every
  // digest — including the ones that carry no jobs at all, and the ones whose
  // percentages came entirely from neutral defaults. Say what is actually in
  // the email. (Seekers whose profile states too little to rank against are no
  // longer sent a job section at all; see dailyRecommendations.ts.)
  const intro =
    jobs.length > 0
      ? isAr
        ? `إليك أقرب ${jobs.length} وظائف مطابقة لملفك الشخصي اليوم:`
        : `Here ${jobs.length === 1 ? "is the closest match" : `are the ${jobs.length} closest matches`} to your profile today:`
      : isAr
        ? "إليك آخر مستجدات ملفك الشخصي:"
        : "Here's the latest activity on your profile:";

  // Bayt-style job cards with company logos
  const jobCards = jobs
    .map((j) => {
      const salaryText = salaryLine(j.salary, isAr);
      const matchColor =
        j.matchScore >= 80
          ? "#059669"
          : j.matchScore >= 60
            ? "#0D6FD8"
            : "#d97706";
      const bgColor = logoColor(j.company);
      const initials = companyInitials(j.company);

      return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #f3f4f6;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="width: 48px; vertical-align: top;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: ${bgColor}; color: white; font-size: 14px; font-weight: 700; text-align: center; line-height: 44px;">
                  ${initials}
                </div>
              </td>
              <td style="padding-${isAr ? "right" : "left"}: 12px; vertical-align: top;">
                <a href="${baseUrl}/${locale}/job-seeker/jobs/${j.jobId}" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 15px;">${bidi(j.title)}</a>
                <p style="margin: 2px 0 0; color: #374151; font-size: 13px; font-weight: 500;">${bidi(j.company)}</p>
                <p style="margin: 3px 0 0; color: #6b7280; font-size: 12px; line-height: 18px;">📍 ${bidi(j.location || "Remote")}${salaryText ? ` · <span style="white-space: nowrap;">${salaryText}</span>` : ""}</p>
                ${
                  // Why this job scored what it did. A bare percentage is the
                  // thing seekers distrust; naming the skills that earned it
                  // costs one line and makes the number checkable.
                  j.matchedSkills && j.matchedSkills.length > 0
                    ? `<p style="margin: 3px 0 0; color: #059669; font-size: 11px; line-height: 16px;">${isAr ? "مهاراتك المطابقة" : "Your matching skills"}: ${bidi(j.matchedSkills.slice(0, 4).join(", "))}</p>`
                    : ""
                }
              </td>
              <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top; width: 62px;">
                <span style="background: ${matchColor}; color: #ffffff; padding: 2px 7px; border-radius: 10px; font-size: 11px; line-height: 16px; font-weight: 600; white-space: nowrap; display: inline-block;">${j.matchScore}%</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  // Profile activity — a secondary insight, so it reads as a compact strip
  // rather than a second full-width section competing with the jobs.
  const namedViewers = profileViews.viewers.slice(0, 2).map((v) => bidi(v.name));
  const extraViewers = profileViews.count - namedViewers.length;
  const viewsSection =
    profileViews.count > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-top: 24px; background-color: #eff6ff; border-radius: 8px;">
          <tr>
            <td style="padding: 14px 16px; border-${isAr ? "right" : "left"}: 4px solid #0D6FD8; border-radius: 8px;">
              <div style="color: #1e3a8a; font-size: 13px; font-weight: 700; line-height: 18px;">&#128065; ${viewsTitle}</div>
              <div style="color: #374151; font-size: 13px; line-height: 19px; margin-top: 4px;">
                <strong style="color: #1e40af;">${profileViews.count}</strong>
                ${isAr ? "خلال الـ 24 ساعة الماضية" : "in the last 24 hours"}${
                  namedViewers.length
                    ? ` — ${namedViewers.join(", ")}${extraViewers > 0 ? ` +${extraViewers} ${isAr ? "آخرين" : "more"}` : ""}`
                    : ""
                }
              </div>
              <a href="${baseUrl}/${locale}/job-seeker/profile" style="color: #0D6FD8; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-block; margin-top: 6px;">${isAr ? "عرض ملفي &#8592;" : "View profile &#8594;"}</a>
            </td>
          </tr>
        </table>`
      : "";

  // Improve your matches — the honest counterpart to the percentages above.
  // A match score is only as good as what the profile states, so when it states
  // little, say so and link to the fix rather than implying the inputs were
  // complete. Hidden once the profile is in good shape.
  const improveSection =
    profile && profile.completeness < 70
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-top: 16px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
          <tr>
            <td style="padding: 14px 16px;">
              <div style="color: #92400e; font-size: 13px; font-weight: 700; line-height: 18px;">${isAr ? "حسّن نتائج المطابقة" : "Improve your matches"}</div>
              <div style="color: #78350f; font-size: 13px; line-height: 19px; margin-top: 4px;">
                ${isAr
                  ? `ملفك الشخصي مكتمل بنسبة ${profile.completeness}%. أضف مهاراتك والدول المفضلة لديك للحصول على توصيات أدق.`
                  : `Your profile is ${profile.completeness}% complete. Add your skills and preferred countries to get more relevant recommendations.`}
              </div>
              <a href="${baseUrl}/${locale}/job-seeker/preferences" style="color: #b45309; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-block; margin-top: 6px;">${isAr ? "تحسين ملفي &#8592;" : "Improve profile &#8594;"}</a>
            </td>
          </tr>
        </table>`
      : "";

  // Nothing cleared the bar. Say so plainly, with the number, so the seeker
  // can tell the difference between "the platform is dead" and "we hold
  // recommendations to a standard". Blocker copy names the constraint that
  // removed the most jobs, which is the one they can actually act on.
  const blockerCopy: Record<string, { en: string; ar: string }> = {
    // Profile gaps first — the only causes the seeker can fix today, and the
    // ones that cap their score no matter what the job board does.
    // Checked before anything is scored: with no country there is nowhere to
    // recommend jobs, so this replaces the whole "closest match" note.
    no_location: {
      en: "Add the country you want to work in. We only recommend jobs where we know you can work, so we can't send you matches until you add one.",
      ar: "أضف الدولة التي ترغب في العمل بها. نوصي فقط بالوظائف في مكان نعرف أنه يناسبك، لذا لا يمكننا إرسال مطابقات لك حتى تضيفها.",
    },
    no_skills: {
      en: "Your profile doesn't list any skills yet. Skills are the largest part of how we match you, so adding a few is the fastest way to start getting matches.",
      ar: "ملفك الشخصي لا يتضمن أي مهارات بعد. المهارات هي الجزء الأكبر من طريقة المطابقة، وإضافة بعضها هو أسرع طريقة للبدء في تلقي الوظائف المناسبة.",
    },
    no_roles: {
      en: "Your profile doesn't say what roles you're looking for, so we can only guess. Adding a job title or two sharpens every match.",
      ar: "ملفك الشخصي لا يوضح الوظائف التي تبحث عنها، لذا لا يمكننا سوى التخمين. إضافة مسمى وظيفي أو اثنين يحسّن كل مطابقة.",
    },
    score: {
      en: "Nothing on the board is a close enough fit for your profile right now. We'd rather send you nothing than a weak match.",
      ar: "لا توجد حالياً وظائف مطابقة بدرجة كافية لملفك الشخصي. نفضّل ألا نرسل لك شيئاً على أن نرسل مطابقة ضعيفة.",
    },
    country: {
      en: "Most openings right now are outside the countries on your profile.",
      ar: "معظم الوظائف المتاحة حالياً خارج الدول المحددة في ملفك.",
    },
    experience: {
      en: "Most openings right now ask for more years than your profile shows.",
      ar: "معظم الوظائف المتاحة تطلب سنوات خبرة أكثر مما يظهر في ملفك.",
    },
    // The two "we can't tell" blockers. Most openings state a minimum, and we
    // will not claim a match we cannot stand behind — so these ask for the one
    // missing field rather than guessing at it.
    experience_unknown: {
      en: "Most openings state a minimum number of years, and your profile doesn't say how much experience you have. Adding it unlocks those jobs.",
      ar: "معظم الوظائف تحدد حداً أدنى من سنوات الخبرة، وملفك لا يوضح خبرتك. إضافتها تفتح لك هذه الوظائف.",
    },
    education_unknown: {
      en: "Some openings ask for a specific qualification, and your profile doesn't list one yet. Adding your education lets us include them.",
      ar: "بعض الوظائف تطلب مؤهلاً محدداً، وملفك لا يتضمن أي مؤهل بعد. إضافة مؤهلك تتيح لنا تضمينها.",
    },
    salary: {
      en: "Most openings right now pay below your stated expectation.",
      ar: "معظم الوظائف المتاحة تقل عن الراتب المتوقع الذي حددته.",
    },
    work_mode: {
      en: "Most openings right now do not match your remote or on-site preference.",
      ar: "معظم الوظائف المتاحة لا تطابق تفضيلك للعمل عن بُعد أو من المكتب.",
    },
    education: {
      en: "Most openings right now ask for a higher qualification than your profile lists.",
      ar: "معظم الوظائف المتاحة تطلب مؤهلاً أعلى مما هو مدرج في ملفك.",
    },
  };

  // No country known: nothing was scored, so there is no score to quote — the
  // note is only the question and the link to answer it.
  const noLocationSection = nearMiss?.topBlocker === "no_location"
    ? `
        <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h3 style="color: #111827; font-size: 15px; margin: 0 0 8px;">${isAr ? "أين ترغب في العمل؟" : "Where do you want to work?"}</h3>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">${isAr ? blockerCopy.no_location.ar : blockerCopy.no_location.en}</p>
          <a href="${baseUrl}/${locale}/job-seeker/preferences" style="background: #0D6FD8; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">${isAr ? "أضف دولة مفضلة" : "Add a preferred country"}</a>
        </div>`
    : null;

  const nearMissSection = noLocationSection ?? (nearMiss
    ? `
        <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h3 style="color: #111827; font-size: 15px; margin: 0 0 8px;">${isAr ? "لا توجد مطابقات قوية بعد" : "No strong matches yet"}</h3>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
            ${
              // With nothing scored there is no "closest match" to quote, and
              // "we checked 0 openings" reads like a broken email.
              nearMiss.considered === 0
                ? isAr
                  ? `لم نجد أي وظيفة تطابق تفضيلاتك الحالية. نرسل فقط المطابقات التي تبلغ ${nearMiss.threshold}% فأكثر.`
                  : `We found no openings matching your current preferences. We only send matches of ${nearMiss.threshold}% and above.`
                : isAr
                  ? `راجعنا ${nearMiss.considered} وظيفة. أقربها إلى ملفك حقق ${nearMiss.bestScore}%، ونحن نرسل فقط ما يبلغ ${nearMiss.threshold}% فأكثر.`
                  : `We checked ${nearMiss.considered} ${nearMiss.considered === 1 ? "opening" : "openings"}. The closest was a ${nearMiss.bestScore}% match, and we only send you ${nearMiss.threshold}% and above.`
            }
          </p>
          ${
            nearMiss.topBlocker && blockerCopy[nearMiss.topBlocker]
              ? `<p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">${isAr ? blockerCopy[nearMiss.topBlocker].ar : blockerCopy[nearMiss.topBlocker].en}</p>`
              : ""
          }
          ${
            nearMiss.topBlocker === "no_skills" ||
            nearMiss.topBlocker === "no_roles" ||
            nearMiss.topBlocker === "experience_unknown" ||
            nearMiss.topBlocker === "education_unknown"
              ? `<a href="${baseUrl}/${locale}/job-seeker/profile" style="background: #0D6FD8; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">${isAr ? "أكمل ملفك الشخصي" : "Complete your profile"}</a>`
              : `<a href="${baseUrl}/${locale}/job-seeker/preferences" style="color: #0D6FD8; text-decoration: none; font-weight: 600; font-size: 14px;">${isAr ? "حدّث تفضيلاتك ←" : "Update your preferences →"}</a>`
          }
        </div>`
    : "");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; direction: ${dir};">
      ${emailHeader(isAr ? "ملخصك اليومي" : "Your Daily Digest", { baseUrl })}
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; line-height: 1.6;">${greeting},</p>
        <p style="color: #6b7280; font-size: 14px;">
          ${intro}
        </p>

        ${
          jobs.length > 0
            ? `
        <h3 style="color: #111827; font-size: 16px; margin: 20px 0 12px;">🎯 ${jobsTitle}</h3>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            ${jobCards}
          </table>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${baseUrl}/${locale}/job-seeker/jobs" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${isAr ? "عرض جميع الوظائف" : "View All Jobs"}
          </a>
        </div>`
            : ""
        }

        ${nearMissSection}
        ${viewsSection}
        ${improveSection}
      </div>
      ${emailFooter({
        locale,
        baseUrl,
        reason: isAr
          ? "تتلقى هذا البريد لأنك فعّلت توصيات الوظائف."
          : "You're receiving this because you enabled job recommendations.",
        unsubRef: "digest",
        // Turns off job recommendations only — the category digestGate reads —
        // not interview invites or password resets.
        userId: data.userId,
        unsubCategory: "jobs",
      })}
    </div>
  `;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
