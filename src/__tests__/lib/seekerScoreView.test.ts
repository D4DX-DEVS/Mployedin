/**
 * What a seeker is shown as the match on their own application
 * (lib/applications/seekerView.ts). The list and the detail route both lay
 * these fields over the stored document.
 */
import { seekerScoreView } from "@/lib/applications/seekerView";

it("shows the engine's number, never the employer's re-weighted ranking", () => {
  const app = { aiMatchScore: 88, seekerMatchScore: 71 };
  expect({ ...app, ...seekerScoreView(app) }.aiMatchScore).toBe(71);
});

it("shows no figure when the application was scored on a profile with nothing to read", () => {
  // Stored null by buildApplicantMatch. Falling back to aiMatchScore here
  // would print the employer's ranking of an empty profile instead.
  const app = { aiMatchScore: 14, seekerMatchScore: null };
  const shown = { ...app, ...seekerScoreView(app) };
  expect(shown.aiMatchScore).toBeUndefined();
  expect(JSON.parse(JSON.stringify(shown))).not.toHaveProperty("aiMatchScore");
});

it("leaves a document from before the field existed as it is", () => {
  const app: { aiMatchScore: number; seekerMatchScore?: number | null } = { aiMatchScore: 64 };
  expect({ ...app, ...seekerScoreView(app) }.aiMatchScore).toBe(64);
});
