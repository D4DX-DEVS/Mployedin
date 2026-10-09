import { singularizeTitle } from "@/lib/ui/singularize";

// BUG-011: dialog titles are built from plural list titles.
describe("singularizeTitle", () => {
  it.each([
    ["Industries", "Industry"],
    ["Job categories", "Job category"],
    ["Genders", "Gender"],
    ["Job Skills", "Job Skill"],
    ["Major Subjects", "Major Subject"],
    ["Marital Status", "Marital Status"],
    ["FAQs", "FAQ"],
    ["Videos", "Video"],
    ["Users", "User"],
  ])("singularizes %s → %s", (input, expected) => {
    expect(singularizeTitle(input)).toBe(expected);
  });
});
