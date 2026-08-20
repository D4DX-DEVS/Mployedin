/** @jest-environment node */

import fs from "node:fs";
import path from "node:path";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

describe("user-centred error copy", () => {
  it.each(["en", "ar"])("does not reintroduce generic legacy copy in %s", (locale) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
    );
    const strings = collectStrings(messages);

    if (locale === "en") {
      expect(strings.filter((text) => /^(Failed to|Something went wrong)/.test(text))).toEqual([]);
    } else {
      expect(strings.filter((text) => /^(فشل |حدث خطأ ما|تعذر في )/.test(text))).toEqual([]);
    }
  });

  it("does not render caught exception messages directly in product UI", () => {
    const roots = ["src/app", "src/components"];
    const files: string[] = [];

    const visit = (directory: string) => {
      if (directory === path.join("src", "app", "api")) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (/\.tsx?$/.test(entry.name)) files.push(target);
      }
    };

    roots.forEach(visit);
    const unsafe = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /instanceof Error\s*\?\s*\w+\.message|\{\s*\w+\.message\s*\|\|/.test(source);
    });

    expect(unsafe).toEqual([]);
  });
});
