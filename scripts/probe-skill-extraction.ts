/**
 * Owner decision O3: does the extraction model invent or repeat skills?
 *
 * On 2026-09-22 Qwen 3.7 Flash returned job skills that were only 50%
 * supported by the job text (Gemini 3.1 Flash-Lite: 100%). This reads 3 active
 * jobs with real descriptions (read-only), runs the production extraction on
 * each, and reports how many returned skills appear in the job's own text.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/probe-skill-extraction.ts
 *
 * Cost: 3 calls on the extraction model, under $0.001 on Qwen. Writes nothing.
 * Decision rule: under 80% supported, set OPENROUTER_EXTRACTION_MODEL=google/gemini-3.1-flash-lite.
 */

import mongoose from "mongoose";
import Job from "@/models/Job";
import { extractJobSkills } from "@/lib/matching/jobSkillExtraction";
import { OPENROUTER_MODELS } from "@/lib/ai/openRouter";

const out = (line: string) => process.stdout.write(`${line}\n`);

interface ProbeJob {
  title?: string;
  description?: string;
  requirements?: { skills?: string[] };
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const jobs = await Job.find({ status: "active", description: { $regex: /\S[\s\S]{300,}/ } })
    .select("title description requirements.skills")
    .sort({ createdAt: -1 })
    .limit(3)
    .lean<ProbeJob[]>();

  out(`extraction model: ${OPENROUTER_MODELS.extraction}`);
  let returned = 0;
  let supported = 0;
  for (const job of jobs) {
    const { skills, preferred } = await extractJobSkills(job);
    const text = `${job.title ?? ""}\n${job.description ?? ""}`.toLowerCase();
    const all = [...skills, ...preferred];
    const unsupported = all.filter((skill) => !text.includes(skill.toLowerCase()));
    returned += all.length;
    supported += all.length - unsupported.length;
    out(`\n${job.title}: ${all.length} skills, ${all.length - unsupported.length} found in the text`);
    if (unsupported.length) out(`  not found verbatim (check by hand): ${unsupported.join(", ")}`);
  }
  const share = returned ? Math.round((supported / returned) * 100) : 100;
  out(`\nsupported: ${supported}/${returned} (${share}%) — ${share >= 80 ? "keep the default" : "pin OPENROUTER_EXTRACTION_MODEL to Gemini"}`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
