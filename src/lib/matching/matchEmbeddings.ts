/**
 * Keeps each job's and seeker's matching vector in step with its text.
 *
 * Called by the refresh cron (src/lib/inngest/matchEmbeddings.ts) for recently
 * changed documents and for documents never processed. A document whose text
 * hash matches the stored one costs one read and nothing else. Writes go out
 * with timestamps off: bumping updatedAt here would make every write look like
 * a profile change to the next sweep.
 *
 * A job with no employer skills and no extraction yet gets its AI skills first
 * (issue 4): `extractJobSkills` had no runtime caller, so those jobs sat at the
 * skill floor and embedded as title-only text.
 */
import type { Model } from "mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { connectDB } from "@/lib/db/mongoose";
import { embedForMatching, matchEmbeddingModel } from "@/lib/ai/openRouterEmbeddings";
import { extractJobSkills } from "@/lib/matching/jobSkillExtraction";
import { removeMatchVectors, syncMatchVectors, vectorSyncEnabled } from "@/lib/matching/vectorStore";
import {
  jobMatchText,
  seekerMatchText,
  JOB_MATCH_TEXT_FIELDS,
  SEEKER_MATCH_TEXT_FIELDS,
  type JobTextSource,
  type SeekerTextSource,
} from "@/lib/matching/matchText";

export type MatchKind = "job" | "seeker";

export interface RefreshResult {
  scanned: number;
  embedded: number;
  unchanged: number;
  /** Documents with no text left; their old vector was removed. */
  emptied: number;
  skillsExtracted: number;
}

type Doc = Record<string, unknown> & { _id: unknown; matchTextHash?: string };

const UNSET_VECTOR = { matchEmbedding: 1, matchEmbeddingAt: 1, matchEmbeddingModel: 1 } as const;

function needsSkills(job: Doc): boolean {
  const req = (job.requirements ?? {}) as { skills?: string[]; aiSkillsAt?: Date };
  return !(req.skills?.length) && !req.aiSkillsAt;
}

async function addSkills(job: Doc): Promise<boolean> {
  const extracted = await extractJobSkills(job as Parameters<typeof extractJobSkills>[0]);
  if (extracted.skills.length === 0) return false;
  const set = {
    "requirements.aiSkills": extracted.skills,
    "requirements.aiPreferredSkills": extracted.preferred,
    "requirements.aiSkillsAt": new Date(),
  };
  await Job.updateOne({ _id: job._id }, { $set: set }, { timestamps: false });
  job.requirements = {
    ...((job.requirements ?? {}) as object),
    aiSkills: extracted.skills,
    aiPreferredSkills: extracted.preferred,
    aiSkillsAt: set["requirements.aiSkillsAt"],
  };
  return true;
}

/**
 * A document can come back into the pool with the same text (a paused job
 * reopened, a seeker un-archived), or have missed an earlier Vectorize write.
 * Its hash says unchanged, so it is never re-embedded: copy its stored vector
 * to Vectorize again. Only when Vectorize is kept in step, and only for the
 * documents this run already loaded (recently changed ones).
 */
async function resyncUnchanged(Model: Model<Doc>, kind: MatchKind, ids: string[]): Promise<void> {
  if (!vectorSyncEnabled() || ids.length === 0) return;
  const rows = (await Model.find({ _id: { $in: ids }, matchEmbeddingModel: matchEmbeddingModel() })
    .select("+matchEmbedding")
    .lean()) as unknown as Array<{ _id: unknown; matchEmbedding?: number[] }>;
  await syncMatchVectors(
    kind,
    rows.filter((r) => r.matchEmbedding?.length).map((r) => ({ id: String(r._id), values: r.matchEmbedding as number[] })),
  );
}

export async function refreshMatchEmbeddings(
  kind: MatchKind,
  filter: Record<string, unknown>,
  opts: { limit: number; dryRun?: boolean },
): Promise<RefreshResult> {
  await connectDB();
  const Model = (kind === "job" ? Job : JobSeeker) as unknown as Model<Doc>;
  const fields = kind === "job" ? JOB_MATCH_TEXT_FIELDS : SEEKER_MATCH_TEXT_FIELDS;
  const docs = (await Model.find(filter)
    .select(`${fields} +matchTextHash`)
    .sort({ updatedAt: -1 })
    .limit(opts.limit)
    .lean()) as unknown as Doc[];

  const result: RefreshResult = { scanned: docs.length, embedded: 0, unchanged: 0, emptied: 0, skillsExtracted: 0 };
  const toEmbed: Array<{ doc: Doc; text: string; hash: string }> = [];
  const emptiedIds: string[] = [];
  const unchangedIds: string[] = [];

  for (const doc of docs) {
    if (kind === "job" && !opts.dryRun && needsSkills(doc) && (await addSkills(doc))) result.skillsExtracted++;
    const { text, hash } = kind === "job" ? jobMatchText(doc as JobTextSource) : seekerMatchText(doc as SeekerTextSource);
    if (hash === doc.matchTextHash) {
      result.unchanged++;
      unchangedIds.push(String(doc._id));
    } else if (!text) {
      result.emptied++;
      if (!opts.dryRun) {
        await Model.updateOne({ _id: doc._id }, { $set: { matchTextHash: hash }, $unset: UNSET_VECTOR }, { timestamps: false });
        emptiedIds.push(String(doc._id));
      }
    } else {
      toEmbed.push({ doc, text, hash });
    }
  }

  result.embedded = toEmbed.length;
  // VECTOR_STORE=shadow|vectorize: the copy in Vectorize follows (lib/matching/vectorStore.ts).
  await removeMatchVectors(kind, emptiedIds);
  if (!opts.dryRun) await resyncUnchanged(Model, kind, unchangedIds);
  if (opts.dryRun || toEmbed.length === 0) return result;

  const vectors = await embedForMatching(toEmbed.map((e) => e.text));
  const model = matchEmbeddingModel();
  const now = new Date();
  for (let i = 0; i < toEmbed.length; i++) {
    await Model.updateOne(
      { _id: toEmbed[i].doc._id },
      { $set: { matchEmbedding: vectors[i], matchEmbeddingAt: now, matchEmbeddingModel: model, matchTextHash: toEmbed[i].hash } },
      { timestamps: false },
    );
  }
  await syncMatchVectors(
    kind,
    toEmbed.map((e, i) => ({ id: String(e.doc._id), values: vectors[i] })),
  );
  return result;
}
