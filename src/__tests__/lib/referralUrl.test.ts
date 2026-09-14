import { referralPathFor, referralUrlFor, REFERRAL_CODE_RE } from "@/lib/referrals/url";

describe("referral URL helper", () => {
  it("routes employer links (and legacy links with no audience) to employer-register", () => {
    expect(referralPathFor("employer", "en")).toBe("/en/employer-register?ref=");
    expect(referralPathFor(undefined, "ar")).toBe("/ar/employer-register?ref=");
  });

  it("routes job-seeker links to /register", () => {
    expect(referralPathFor("job_seeker", "en")).toBe("/en/register?ref=");
  });

  it("builds a full URL from origin + locale + code", () => {
    expect(referralUrlFor({ code: "MPL-ABCD1234", audience: "job_seeker" }, "ar", "https://mployedin.com"))
      .toBe("https://mployedin.com/ar/register?ref=MPL-ABCD1234");
    expect(referralUrlFor({ code: "MPL-ABCD1234" }, "", "http://localhost:3888"))
      .toBe("http://localhost:3888/en/employer-register?ref=MPL-ABCD1234");
  });

  it("accepts both legacy 8-hex and current 16-hex codes and rejects junk", () => {
    expect(REFERRAL_CODE_RE.test("MPL-1A2B3C4D")).toBe(true);
    expect(REFERRAL_CODE_RE.test("MPL-1A2B3C4D5E6F7A8B")).toBe(true);
    expect(REFERRAL_CODE_RE.test("mpl-abcd")).toBe(false);
    expect(REFERRAL_CODE_RE.test("MPL-<script>")).toBe(false);
    expect(REFERRAL_CODE_RE.test("")).toBe(false);
  });
});
