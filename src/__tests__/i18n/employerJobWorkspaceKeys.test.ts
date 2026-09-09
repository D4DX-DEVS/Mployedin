import IntlMessageFormat from "intl-messageformat";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

type Messages = Record<string, Record<string, string>>;
const enAll = en as unknown as Messages;
const arAll = ar as unknown as Messages;

const WORKSPACE_KEYS = [
  "tabOverview", "tabApplications", "tabInterviews", "tabOffers", "tabHires", "tabPosting", "tabSetup",
  "tabsLabel", "tabWithCount", "backToJobs", "moreActions",
  "edit", "share", "publish", "publishing", "pause", "resume",
  "clone", "cloning", "saveAsTemplate", "templateSaving", "templateSaved", "closeJob", "deleteDraft", "openSetup", "confirmDuplicate", "duplicateConfirmLabel",
  "confirmPublish", "confirmCloseJob", "confirmDeleteDraft",
  "statusUpdated", "statusUpdateError", "cloneError", "templateError", "deleteError",
  "loadError", "retry", "notFound", "notFoundDesc", "draftHint",
  "funnelSummary", "funnelLabel",
  "needsAttentionTitle", "needsAttentionSummary", "needsAttentionView", "needsAttentionEmpty",
  "unreviewed", "interviewsAwaitingOutcome", "interviewsUpcoming", "rescheduleRequests",
  "offersPending", "offersExpiring", "checksInProgress",
  "factsHeading", "factsVacancies", "factsViews", "factsSalary", "factsExpires", "noExpiry", "negotiable", "posted", "remoteSuffix",
  "overviewDescription", "overviewNoDescription", "overviewResponsibilities", "overviewQualifications", "overviewRequirements",
  "overviewSkills", "overviewExperience", "overviewYearsRange", "overviewEducation", "overviewLanguages", "overviewTags",
  "applicationsHeading", "viewAllApplications", "openThisJob",
  "postingHeading", "postingPublicTitle", "postingPublicDesc", "postingPublicLink", "postingCopyLink", "postingLinkCopied", "postingDraftNote",
  "postingPostersTitle", "postingPostersDesc", "postingCreatePoster", "postingManagePosters",
  "postingTemplateTitle", "postingTemplateDesc", "postingManageTemplates",
  "setupHeading", "setupSectionsLabel", "setupWorkflow", "setupWeights",
  "boardLoadMore", "boardLoadingMore", "boardShowing", "boardApplied", "boardStagesOf", "boardPrevStage", "boardNextStage", "boardStageOf",
];

const JOBS_KEYS = ["openJobButton", "closeJobButton", "closingButton", "confirmCloseJob", "toastJobClosed", "toastFailedClose", "cloneButton", "cloningButton", "clonedBadge", "confirmDuplicate", "duplicateConfirmLabel"];

describe("employerJobWorkspace namespace", () => {
  it.each(WORKSPACE_KEYS)("has %s in en and ar", (key) => {
    expect(enAll.employerJobWorkspace?.[key]).toEqual(expect.any(String));
    expect(arAll.employerJobWorkspace?.[key]).toEqual(expect.any(String));
  });

  it.each(JOBS_KEYS)("employerJobs has %s in en and ar", (key) => {
    expect(enAll.employerJobs?.[key]).toEqual(expect.any(String));
    expect(arAll.employerJobs?.[key]).toEqual(expect.any(String));
  });

  it("has the same key set in both locales", () => {
    expect(Object.keys(arAll.employerJobWorkspace).sort()).toEqual(Object.keys(enAll.employerJobWorkspace).sort());
  });

  it.each([["en", enAll], ["ar", arAll]] as const)("every %s message compiles as ICU", (locale, all) => {
    for (const [key, msg] of Object.entries(all.employerJobWorkspace)) {
      expect(() => new IntlMessageFormat(msg, locale)).not.toThrow();
      expect(msg.startsWith("Failed to")).toBe(false);
      void key;
    }
  });

  it("plural messages render for every count", () => {
    const plural = ["needsAttentionSummary", "unreviewed", "interviewsAwaitingOutcome", "interviewsUpcoming", "rescheduleRequests", "offersPending", "offersExpiring", "checksInProgress"];
    for (const key of plural) {
      for (const [locale, all] of [["en", enAll], ["ar", arAll]] as const) {
        const fmt = new IntlMessageFormat(all.employerJobWorkspace[key], locale);
        for (const count of [0, 1, 2, 3, 11, 100]) expect(String(fmt.format({ count }))).not.toBe("");
      }
    }
  });
});
