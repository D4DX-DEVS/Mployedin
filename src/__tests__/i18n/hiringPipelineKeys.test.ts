import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { STAGE_LABEL_KEYS } from "@/lib/hiring/pipeline";

describe("hiringPipeline namespace", () => {
  const required = [...new Set(Object.values(STAGE_LABEL_KEYS)), "restoreStage", "restoreStagePlaceholder", "allStagesPresent"];
  const enNs = (en as unknown as Record<string, Record<string, string>>).hiringPipeline;
  const arNs = (ar as unknown as Record<string, Record<string, string>>).hiringPipeline;
  it.each(required)("has %s in en and ar", (key) => {
    expect(enNs?.[key]).toEqual(expect.any(String));
    expect(arNs?.[key]).toEqual(expect.any(String));
  });
});
