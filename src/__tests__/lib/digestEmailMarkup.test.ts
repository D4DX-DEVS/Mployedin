/**
 * @jest-environment node
 *
 * Email HTML is not web HTML. Gmail strips `display: flex`, `conic-gradient`
 * and friends, and it rewrites text colours in dark mode without being able to
 * invert a CSS gradient background. Both rules were broken at once:
 *
 *   - the profile-completion email drew its percentage as a conic-gradient ring
 *     centred with flexbox, so in Gmail the ring vanished, the inner circle
 *     collapsed to a block in the corner of its 80px box, and "0%" floated in
 *     the empty space beside it;
 *   - both headers painted white text over a `linear-gradient`, so Gmail dark
 *     mode darkened the text and left the blue behind it — "MPLOYEDIN" and
 *     "Your Daily Digest" were near-invisible.
 *
 * These tests pin the markup rules rather than the wording.
 */
import { buildDigestEmail } from "@/lib/inngest/dailyDigestWorker";
import { buildProfileCompletionEmail } from "@/lib/inngest/reEngagement";
import { emailHeader, emailProgressBar, emailFooter } from "@/lib/communications/emailLayout";
import { profileCompleteness } from "@/lib/jobSeeker/profileCompleteness";

/** Properties no mail client can be relied on to honour. */
const UNSUPPORTED = [
  "display: flex",
  "display:flex",
  "conic-gradient",
  "linear-gradient",
  "align-items",
  "justify-content",
  "gap:",
  "gap: ",
];

function assertEmailSafe(html: string) {
  for (const prop of UNSUPPORTED) {
    expect(html.toLowerCase()).not.toContain(prop.toLowerCase());
  }
}

const jobs = [
  {
    jobId: "j1",
    title: "Site Engineer",
    company: "Beta Industries",
    location: "India",
    matchScore: 72,
  },
];

const noViews = { count: 0, viewers: [] };

describe("emailHeader", () => {
  it("uses a solid dark bgcolor rather than a gradient", () => {
    const html = emailHeader("Your Daily Digest");
    assertEmailSafe(html);
    expect(html).toContain('bgcolor="#0a2a6e"');
    expect(html).toContain("background-color: #0a2a6e");
  });

  it("renders the logo as an absolute URL — email cannot resolve relative paths", () => {
    const html = emailHeader(undefined, { baseUrl: "https://mployedin.com" });
    expect(html).toContain('src="https://mployedin.com/logo-email-white.png"');
    expect(html).not.toContain('src="/logo');
  });

  it("carries the wordmark as alt text so a blocked image still reads", () => {
    const html = emailHeader(undefined, { baseUrl: "https://x.test" });
    expect(html).toContain('alt="MPLOYEDIN"');
    // The alt text inherits white so it is legible on the dark header.
    expect(html).toContain("color: #ffffff");
  });

  it("gives the logo explicit width and height attributes", () => {
    // Outlook drops CSS sizing on images; the attributes are what it honours.
    const html = emailHeader();
    expect(html).toMatch(/<img[^>]*\swidth="\d+"[^>]*\sheight="\d+"/);
  });

  it("strips a trailing slash rather than emitting a double slash", () => {
    expect(emailHeader(undefined, { baseUrl: "https://x.test/" })).toContain("https://x.test/logo-email-white.png");
  });

  it("escapes the subtitle", () => {
    expect(emailHeader('"><script>')).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("emailFooter", () => {
  it("renders no unsupported CSS", () => {
    assertEmailSafe(emailFooter({ locale: "en", baseUrl: "https://x.test", reason: "r", unsubRef: "digest" }));
  });

  it("carries the reason, both links, the no-reply note and a copyright", () => {
    const html = emailFooter({ locale: "en", baseUrl: "https://x.test", reason: "Because you opted in.", unsubRef: "digest" });
    expect(html).toContain("Because you opted in.");
    expect(html).toContain("https://x.test/en/job-seeker/settings/notifications");
    expect(html).toContain("https://x.test/api/unsubscribe?ref=digest");
    expect(html).toMatch(/please don't reply/i);
    expect(html).toContain(`&copy; ${new Date().getFullYear()} MPLOYEDIN`);
  });

  it("escapes the reason and url-encodes the unsubscribe ref", () => {
    const html = emailFooter({ locale: "en", reason: '<script>x</script>', unsubRef: "a b&c" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("ref=a%20b%26c");
  });
});

describe("emailProgressBar", () => {
  it("renders a table-based bar with no flexbox or gradients", () => {
    for (const pct of [0, 1, 25, 99, 100]) {
      const html = emailProgressBar(pct);
      assertEmailSafe(html);
      expect(html).toContain("<table");
      expect(html).toContain(`${pct}%`);
    }
  });

  it("omits the filled cell entirely at 0 rather than drawing a 0%-wide one", () => {
    const html = emailProgressBar(0);
    expect(html).not.toContain('bgcolor="#0D6FD8"');
    expect(html).toContain('width="100%"');
  });

  it("clamps and rounds out-of-range input", () => {
    expect(emailProgressBar(-20)).toContain(">0%<");
    expect(emailProgressBar(140)).toContain(">100%<");
    expect(emailProgressBar(24.6)).toContain(">25%<");
  });
});

describe("buildDigestEmail", () => {
  it("renders no unsupported CSS", () => {
    assertEmailSafe(buildDigestEmail({ userName: "Ilyas", locale: "en", jobs, profileViews: noViews }));
  });

  it("does not promise job matches when the digest carries none", () => {
    const html = buildDigestEmail({
      userName: "Ilyas",
      locale: "en",
      jobs: [],
      profileViews: { count: 3, viewers: [{ name: "A recruiter", role: "employer" }] },
    });
    // The old copy said "We found some great job matches based on your profile"
    // on every digest, including the profile-views-only ones.
    expect(html).not.toMatch(/job matches|matching your profile/i);
    expect(html).toContain("latest activity on your profile");
  });

  it("states the real number of jobs it is showing", () => {
    const html = buildDigestEmail({ userName: "Ilyas", locale: "en", jobs, profileViews: noViews });
    expect(html).toContain("closest match to your profile today");

    const many = buildDigestEmail({
      userName: "Ilyas",
      locale: "en",
      jobs: [jobs[0], { ...jobs[0], jobId: "j2" }],
      profileViews: noViews,
    });
    expect(many).toContain("are the 2 closest matches");
  });

  it("escapes seeker- and employer-supplied text", () => {
    const html = buildDigestEmail({
      userName: '<img src=x onerror=alert(1)>',
      locale: "en",
      jobs: [{ ...jobs[0], company: "<script>bad</script>" }],
      profileViews: noViews,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>bad");
  });

  it("renders the Arabic digest right-to-left", () => {
    const html = buildDigestEmail({ userName: "إلياس", locale: "ar", jobs, profileViews: noViews });
    expect(html).toContain("direction: rtl");
    assertEmailSafe(html);
  });
});

describe("buildProfileCompletionEmail", () => {
  /** The exact document behind the broken screenshot: nothing but an account. */
  const barelyStarted = profileCompleteness({ userId: "u1" });

  const render = (locale = "en", result = barelyStarted) =>
    buildProfileCompletionEmail({
      userName: "Ilyas",
      locale,
      completeness: result.score,
      done: result.done.length,
      total: result.total,
      missing: result.missing,
      baseUrl: "https://mployedin.com",
    });

  it("renders no unsupported CSS", () => {
    assertEmailSafe(render());
    assertEmailSafe(render("ar"));
  });

  it("never zero-pads the counts", () => {
    // The screenshot read "00 actions completed + 15 actions pending".
    const html = render();
    expect(html).not.toMatch(/\b00\b/);
  });

  it("states counts as a fraction of the real scored fields, not a made-up 15", () => {
    const html = render();
    expect(html).toContain(`${barelyStarted.done.length} of ${barelyStarted.total} completed`);
    expect(html).not.toContain("15 actions");
  });

  it("only asks for fields that are actually missing", () => {
    const withSkills = profileCompleteness({ userId: "u1", skills: ["welding"] });
    const html = render("en", withSkills);
    expect(html).toContain("Add your work experience");
    expect(html).not.toContain("Add your skills");
  });

  it("quotes each field's real weight, so the boosts add up to the percentage", () => {
    const html = render();
    // skills and experience are worth 20 each — the old copy invented 8.
    expect(html).toContain("Boost 20%");
    expect(html).not.toContain("Boost 8%");
    // The CV is not part of the formula, so it must not be sold as a boost.
    expect(html).not.toMatch(/Attach Resume/i);
  });

  it("renders a progress bar carrying the same percentage as the headline", () => {
    const html = render();
    expect(html).toContain(`${barelyStarted.score}%`);
    expect(html).toContain("<table");
  });

  it("renders the Arabic reminder right-to-left", () => {
    const html = render("ar");
    expect(html).toContain("direction: rtl");
    expect(html).toContain("أضف خبراتك المهنية");
  });
});

describe("digest salary line", () => {
  const render = (salary: { min: number; max: number; currency?: string; period?: string }) =>
    buildDigestEmail({
      userName: "Ilyas", locale: "en",
      jobs: [{ ...jobs[0], salary }],
      profileViews: noViews,
    });

  it("uses the job's own currency, not a hardcoded AED", () => {
    // 46 of 62 live jobs are priced in something other than dirhams; every one
    // of them used to be labelled AED.
    expect(render({ min: 50000, max: 80000, currency: "INR" })).toContain("INR 50,000–80,000");
    expect(render({ min: 3000, max: 5000, currency: "QAR" })).toContain("QAR 3,000–5,000");
  });

  it("falls back to AED only when the job states no currency", () => {
    expect(render({ min: 3000, max: 5000 })).toContain("AED 3,000–5,000");
  });

  it("labels the pay period so a yearly range is not read as monthly", () => {
    expect(render({ min: 60000, max: 90000, currency: "USD", period: "yearly" })).toContain("USD 60,000–90,000/yr");
    expect(render({ min: 3000, max: 5000, currency: "AED", period: "monthly" })).toContain("AED 3,000–5,000/mo");
  });

  it("keeps the amount on one line", () => {
    expect(render({ min: 3000, max: 5000, currency: "AED" })).toMatch(
      /white-space: nowrap;">AED 3,000–5,000\/mo</,
    );
  });

  it("renders a single figure when there is no real range", () => {
    expect(render({ min: 0, max: 5000, currency: "OMR" })).toContain("OMR 5,000/mo");
  });

  it("omits the salary entirely when the job states none", () => {
    const html = buildDigestEmail({ userName: "I", locale: "en", jobs: [{ ...jobs[0], salary: undefined }], profileViews: noViews });
    expect(html).not.toMatch(/AED|INR|\/mo/);
  });
});

describe("improve-your-matches block", () => {
  const build = (profile?: { completeness: number; signals: number }) =>
    buildDigestEmail({ userName: "Ilyas", locale: "en", jobs, profileViews: noViews, profile });

  it("appears with the real completeness when the profile is thin", () => {
    const html = build({ completeness: 25, signals: 2 });
    expect(html).toContain("Improve your matches");
    expect(html).toContain("Your profile is 25% complete");
    expect(html).toContain("/en/job-seeker/preferences");
  });

  it("is hidden once the profile is in good shape", () => {
    expect(build({ completeness: 85, signals: 5 })).not.toContain("Improve your matches");
  });

  it("is hidden for older events that carry no profile block", () => {
    expect(build(undefined)).not.toContain("Improve your matches");
  });
});
