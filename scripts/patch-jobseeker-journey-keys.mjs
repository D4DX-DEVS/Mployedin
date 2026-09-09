#!/usr/bin/env node
/**
 * One-off, idempotent locale patch for the job-seeker Application Journey shell
 * (docs/superpowers/specs/2026-09-09-jobseeker-application-journey-shell-design.md).
 *
 * Read → mutate → write in one run, never from a copy read earlier: other
 * sessions edit messages/*.json live.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ADD = {
  en: {
    jobSeekerJourney: {
      title: "My Applications",
      navLabel: "Application journey",
      attention: "{title}, {count, plural, one {# needs} other {# need}} your attention",
      contextApplications: "{total, plural, one {# application} other {# applications}} · {active} active",
      contextInterviews: "{upcoming} upcoming · {past} past",
      contextOffers: "{pending} pending · {accepted} accepted",
      contextOnboarding: "{count, plural, =0 {Nothing in progress} one {# onboarding in progress} other {# onboardings in progress}}",
    },
    jobSeekerInterviews: {
      view: { list: "List", calendar: "Calendar" },
      statusFiltersLabel: "Interview status filters",
    },
    jobSeekerOffers: {
      statusFiltersLabel: "Offer status filters",
    },
  },
  ar: {
    jobSeekerJourney: {
      title: "طلباتي",
      navLabel: "مسار الطلب",
      attention: "{title}، {count, plural, zero {لا شيء يحتاج} one {عنصر واحد يحتاج} two {عنصران يحتاجان} few {# عناصر تحتاج} many {# عنصرًا يحتاج} other {# عنصر يحتاج}} انتباهك",
      contextApplications: "{total, plural, zero {لا طلبات} one {طلب واحد} two {طلبان} few {# طلبات} many {# طلبًا} other {# طلب}} · {active} نشطة",
      contextInterviews: "{upcoming} قادمة · {past} سابقة",
      contextOffers: "{pending} معلقة · {accepted} مقبولة",
      contextOnboarding: "{count, plural, =0 {لا شيء قيد التنفيذ} one {تهيئة واحدة قيد التنفيذ} two {تهيئتان قيد التنفيذ} few {# تهيئات قيد التنفيذ} many {# تهيئة قيد التنفيذ} other {# تهيئة قيد التنفيذ}}",
    },
    jobSeekerInterviews: {
      view: { list: "قائمة", calendar: "التقويم" },
      statusFiltersLabel: "فلاتر حالة المقابلة",
    },
    jobSeekerOffers: {
      statusFiltersLabel: "فلاتر حالة العرض",
    },
  },
};

const DELETE = [
  ["jobSeekerApplications", "summary"],
  ["jobSeekerInterviews", "summary"],
  ["jobSeekerOffers", "header"],
  ["jobSeekerOnboarding", "subtitle"],
  ["jobSeekerOnboarding", "backToApplications"],
];

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

for (const locale of ["en", "ar"]) {
  const file = path.join(ROOT, "messages", `${locale}.json`);
  const raw = fs.readFileSync(file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const data = JSON.parse(raw);

  deepMerge(data, ADD[locale]);
  for (const [ns, key] of DELETE) {
    if (data[ns] && key in data[ns]) delete data[ns][key];
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, eol) + eol, "utf8");
  console.log(`${locale}.json patched`);
}
