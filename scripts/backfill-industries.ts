#!/usr/bin/env node

/**
 * Backfill job seeker industries from their profiles.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-industries.ts          # Dry-run
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-industries.ts --apply  # Actually update DB
 *
 * The script classifies each seeker to one industry based on their experience,
 * skills, education. Industries are stored as industry names from the Industry
 * master catalogue. Unknown/ambiguous seekers are left with industry unset.
 *
 * IMPORTANT: This operates on the SHARED STAGING database (local .env).
 * Run only in --dry-run mode by default. The owner runs --apply.
 */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { classifyIndustry } from "@/lib/jobseekers/industryClassifier";

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  try {
    console.log(`Starting industry backfill (${DRY_RUN ? "DRY RUN" : "APPLY MODE"})...`);
    console.log(`Database: ${process.env.MONGODB_URI}`);
    console.log("");

    await connectDB();

    // Fetch all seekers
    const totalCount = await JobSeeker.countDocuments();
    console.log(`Found ${totalCount} job seekers.`);

    const seekers = await JobSeeker.find()
      .select("_id experience skills education careerProfile cv industry industrySource")
      .lean();

    const distribution: Record<string, number> = {};
    let classified = 0;
    let unclassified = 0;
    let alreadySet = 0;
    let updates = [];

    for (const seeker of seekers) {
      // Skip if already manually set
      if (seeker.industrySource === "manual") {
        alreadySet++;
        continue;
      }

      const result = classifyIndustry(seeker as any);
      const key = result.industry || "(unclassified)";
      distribution[key] = (distribution[key] ?? 0) + 1;

      if (result.industry) {
        classified++;
        if (!DRY_RUN) {
          updates.push({
            updateOne: {
              filter: { _id: seeker._id },
              update: {
                $set: {
                  industry: result.industry,
                  industrySource: "auto",
                },
              },
            },
          });
        }
      } else {
        unclassified++;
      }
    }

    // Execute bulk writes if applying
    if (!DRY_RUN && updates.length > 0) {
      console.log(`Executing ${updates.length} updates...`);
      await JobSeeker.bulkWrite(updates);
    }

    // Report
    console.log("");
    console.log("=== RESULTS ===");
    console.log(`Total seekers: ${totalCount}`);
    console.log(`Already manually set: ${alreadySet}`);
    console.log(`Classified: ${classified}`);
    console.log(`Unclassified: ${unclassified}`);
    console.log("");
    console.log("Distribution:");

    // Sort by count descending
    const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    for (const [industry, count] of sorted) {
      console.log(`  ${industry}: ${count}`);
    }

    if (DRY_RUN) {
      console.log("");
      console.log("✓ DRY RUN - No changes made. Use --apply to update the database.");
    } else {
      console.log("");
      console.log("✓ Updated database successfully.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
