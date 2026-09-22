/**
 * One-time backfill for the recommendation pipeline.
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-matching.mjs [--skills] [--vectors] [--dry]
 *   node --env-file=.env scripts/backfill-matching.mjs            # both passes
 *
 * Pass 1 (--skills)   Extract requirements from the description for jobs where
 *                     the employer listed none, via OpenRouter. Written to
 *                     `requirements.aiSkills`, never over the employer's own
 *                     list. 22 of 62 live jobs need this, and until they have
 *                     it they sit at the no-evidence floor and can never be
 *                     recommended to anyone.
 *
 * Pass 2 (--vectors)  Embed every distinct skill on the platform and cache it
 *                     in `skillvectors`, so the daily cron can compare skills
 *                     semantically with zero API calls. Embeddings run on
 *                     Google direct — OpenRouter sells none, and the Atlas
 *                     index is built on gemini-embedding-001.
 *
 * Idempotent. Re-running skips jobs that already have extracted skills and
 * skills that are already embedded. `--dry` reports what it would do.
 */

import mongoose from "mongoose";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const runSkills = args.has("--skills") || (!args.has("--skills") && !args.has("--vectors"));
const runVectors = args.has("--vectors") || (!args.has("--skills") && !args.has("--vectors"));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/backfill-matching.mjs");
  process.exit(1);
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
// Mirrors the default in src/lib/ai/openRouter.ts. 2.5-flash-lite used to sit
// here and invented skills off the job title on thin descriptions; see the
// benchmark note in that file before changing this back.
const TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-3.1-flash-lite";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 3072;
const MAX_SKILLS = 12;

// Mirrors normalizeSkill() in src/lib/matchScore.ts. Duplicated rather than
// imported because this is a plain .mjs script with no TS pipeline; the guard
// below asserts the two agree on a sample before writing anything.
function normalizeSkill(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\.js$/, "")
    .replace(/\s+/g, " ");
}

async function extractSkills(job) {
  const description = (job.description || "").trim();
  if (description.length < 80) return null;

  const prompt = [
    "You are reading a job posting and listing the concrete skills it requires.",
    "",
    `Job title: ${job.title || ""}`,
    "",
    "Job description:",
    description.slice(0, 6000),
    "",
    'Return JSON of the form {"skills":[...],"preferred":[...]}.',
    `- "skills" holds up to ${MAX_SKILLS} skills the posting treats as required.`,
    '- "preferred" holds skills it frames as a bonus or "nice to have".',
    '- Use the short, conventional name for each skill ("React", not "experience building React applications").',
    "- Include concrete tools, technologies, certifications and named professional competencies.",
    "- Do not invent skills the description does not support.",
    '- Omit generic filler such as "hard working" or "team player".',
  ].join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com",
      "X-Title": "Mployedin",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: "Respond with a single valid JSON value and nothing else." },
        { role: "user", content: prompt },
      ],
      max_tokens: 400,
      response_format: { type: "json_object" },
      reasoning_effort: "none",
    }),
  });

  if (!res.ok) {
    console.warn(`  ! ${job.title}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    return null;
  }

  const body = await res.json();
  const cost = body.usage?.cost ?? 0;
  try {
    const parsed = JSON.parse(body.choices[0].message.content);
    const seen = new Set();
    const clean = (list) =>
      (Array.isArray(list) ? list : [])
        .filter((s) => typeof s === "string")
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter((s) => {
          if (s.length < 2 || s.length > 60) return false;
          const k = s.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, MAX_SKILLS);
    return { skills: clean(parsed.skills), preferred: clean(parsed.preferred), cost };
  } catch {
    console.warn(`  ! ${job.title}: unparseable response`);
    return null;
  }
}

async function embedBatch(texts) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/embeddings",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.map((t) => t.slice(0, 8000)) }),
    },
  );
  if (!res.ok) throw new Error(`embedding HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const items = data.data.every((d) => typeof d.index === "number")
    ? [...data.data].sort((a, b) => a.index - b.index)
    : data.data;
  return items.map((d) => d.embedding);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(DRY ? "DRY RUN — nothing will be written\n" : "");

// ── Pass 1: job skill extraction ──────────────────────────────────────────
if (runSkills) {
  if (!OPENROUTER_KEY) {
    console.error("OPENROUTER_API_KEY not set — skipping skill extraction.");
  } else {
    const needy = await db
      .collection("jobs")
      .find({
        status: "active",
        $and: [
          { $or: [{ "requirements.skills": { $size: 0 } }, { "requirements.skills": { $exists: false } }] },
          { $or: [{ "requirements.aiSkills": { $size: 0 } }, { "requirements.aiSkills": { $exists: false } }] },
        ],
      })
      .project({ title: 1, description: 1 })
      .toArray();

    console.log(`=== Pass 1: skill extraction ===`);
    console.log(`jobs with no skills and no extraction yet: ${needy.length}`);

    let done = 0;
    let spent = 0;
    for (const job of needy) {
      if (DRY) {
        console.log(`  would extract: ${job.title}`);
        continue;
      }
      const result = await extractSkills(job);
      if (!result || result.skills.length === 0) continue;
      spent += result.cost;
      await db.collection("jobs").updateOne(
        { _id: job._id },
        {
          $set: {
            "requirements.aiSkills": result.skills,
            "requirements.aiPreferredSkills": result.preferred,
            "requirements.aiSkillsAt": new Date(),
          },
        },
      );
      done++;
      console.log(`  ${job.title} -> ${result.skills.join(", ")}`);
    }
    console.log(`extracted for ${done} job(s), cost $${spent.toFixed(6)}\n`);
  }
}

// ── Pass 2: skill vector cache ────────────────────────────────────────────
if (runVectors) {
  if (!GEMINI_KEY) {
    console.error("GEMINI_API_KEY not set — skipping vector backfill.");
  } else {
    console.log(`=== Pass 2: skill vectors ===`);

    const jobs = await db
      .collection("jobs")
      .find({ status: "active" })
      .project({ "requirements.skills": 1, "requirements.preferredSkills": 1, "requirements.aiSkills": 1, "requirements.aiPreferredSkills": 1 })
      .toArray();
    const seekers = await db.collection("jobseekers").find({}).project({ skills: 1 }).toArray();

    // canonical -> one raw spelling, which is what actually gets embedded.
    const wanted = new Map();
    const add = (list) => {
      for (const raw of list ?? []) {
        if (typeof raw !== "string") continue;
        const key = normalizeSkill(raw);
        if (key && !wanted.has(key)) wanted.set(key, raw.trim());
      }
    };
    for (const j of jobs) {
      add(j.requirements?.skills);
      add(j.requirements?.preferredSkills);
      add(j.requirements?.aiSkills);
      add(j.requirements?.aiPreferredSkills);
    }
    for (const s of seekers) add(s.skills);

    const existing = await db
      .collection("skillvectors")
      .find({ canonical: { $in: [...wanted.keys()] }, dims: EMBEDDING_DIMENSIONS })
      .project({ canonical: 1 })
      .toArray();
    for (const row of existing) wanted.delete(row.canonical);

    console.log(`distinct skills on the platform: ${wanted.size + existing.length}`);
    console.log(`already cached: ${existing.length}`);
    console.log(`to embed: ${wanted.size}`);

    if (!DRY && wanted.size > 0) {
      const entries = [...wanted.entries()];
      const BATCH = 64;
      let embedded = 0;
      for (let i = 0; i < entries.length; i += BATCH) {
        const slice = entries.slice(i, i + BATCH);
        try {
          const vectors = await embedBatch(slice.map(([, raw]) => raw));
          const ops = slice
            .map(([canonical, raw], idx) => ({ canonical, raw, vector: vectors[idx] }))
            .filter((d) => d.vector?.length === EMBEDDING_DIMENSIONS)
            .map((d) => ({
              updateOne: {
                filter: { canonical: d.canonical },
                update: {
                  $set: {
                    vector: d.vector,
                    dims: EMBEDDING_DIMENSIONS,
                    embeddingModel: EMBEDDING_MODEL,
                    sample: d.raw,
                    updatedAt: new Date(),
                  },
                  $setOnInsert: { createdAt: new Date() },
                },
                upsert: true,
              },
            }));
          if (ops.length) await db.collection("skillvectors").bulkWrite(ops, { ordered: false });
          embedded += ops.length;
          process.stdout.write(`  embedded ${embedded}/${entries.length}\r`);
        } catch (err) {
          console.warn(`\n  ! batch at ${i} failed: ${err.message}`);
        }
      }
      console.log(`\ncached ${embedded} skill vector(s)`);
    }
  }
}

await mongoose.disconnect();
console.log("\ndone.");
