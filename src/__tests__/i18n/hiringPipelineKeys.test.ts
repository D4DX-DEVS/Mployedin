import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { STAGE_LABEL_KEYS } from "@/lib/hiring/pipeline";

describe("hiringPipeline namespace", () => {
  const required = [...new Set(Object.values(STAGE_LABEL_KEYS)), "restoreStage", "restoreStagePlaceholder", "allStagesPresent"];
  it.each(required)("has %s in en and ar", (key) => {
    expect((en as Record<string, Record<string, string>>).hiringPipeline?.[key]).toEqual(expect.any(String));
    expect((ar as Record<string, Record<string, string>>).hiringPipeline?.[key]).toEqual(expect.any(String));
  });
});
