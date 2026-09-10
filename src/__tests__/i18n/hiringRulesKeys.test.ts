import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

/**
 * Every key the hiring-rules editors call. next-intl throws on an unknown key
 * at runtime, so a missing one here takes the whole page down.
 */
const REQUIRED = [
  "pageTitle", "pageDescription",
  "pipelineEyebrow", "pipelineTitle", "pipelineDesc", "outcomes",
  "rulesEyebrow", "rulesTitle", "rulesDesc",
  "shortlistTarget", "shortlistTargetDesc", "shortlistTargetUnit",
  "autoReject", "autoRejectDesc", "autoRejectThreshold", "autoRejectThresholdValue", "autoRejectWarning",
  "notifyCandidates", "notifyCandidatesDesc",
  "on", "off",
  "save", "saveShort", "saving", "saved", "unsavedChanges", "loadError", "saveError",
  "jobFollowsEmployer", "jobHasOwnRules", "saveForJob",
];

describe("hiringRules namespace", () => {
  const enNs = (en as unknown as Record<string, Record<string, string>>).hiringRules;
  const arNs = (ar as unknown as Record<string, Record<string, string>>).hiringRules;
  it.each(REQUIRED)("has %s in en and ar", (key) => {
    expect(enNs?.[key]).toEqual(expect.any(String));
    expect(arNs?.[key]).toEqual(expect.any(String));
  });
  it("retired the stage-builder namespaces nothing renders any more", () => {
    expect((en as Record<string, unknown>).employerWorkflow).toBeUndefined();
    expect((en as Record<string, unknown>).jobWorkflowTab).toBeUndefined();
    expect((ar as Record<string, unknown>).employerWorkflow).toBeUndefined();
    expect((ar as Record<string, unknown>).jobWorkflowTab).toBeUndefined();
  });
  it("never starts an error message with 'Failed to'", () => {
    for (const key of ["loadError", "saveError"]) {
      expect(enNs[key]).not.toMatch(/^failed to/i);
    }
  });
});
