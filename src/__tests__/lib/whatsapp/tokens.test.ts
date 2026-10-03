import { resolveTokens, sanitizeTemplateParam, firstNameOf, tokenNames } from "@/lib/communications/whatsapp/tokens";

describe("tokenNames", () => {
  it("lists the token names a value uses, in order, with the same spacing rules resolveTokens applies", () => {
    expect(tokenNames("Hi {{ firstName }}, {{role}}: {{message}}")).toEqual(["firstName", "role", "message"]);
    expect(tokenNames("no tokens, {single} braces, {{ two words }}")).toEqual([]);
    // Stateless across calls despite the shared global pattern.
    expect(tokenNames("{{title}}")).toEqual(["title"]);
    expect(tokenNames("{{title}}")).toEqual(["title"]);
  });
});

describe("resolveTokens", () => {
  it("substitutes known tokens and blanks unknown ones", () => {
    expect(resolveTokens(["{{firstName}}", "{{message}}", "{{nope}}", "literal"], { firstName: "Sara", message: "Hi" })).toEqual(["Sara", "Hi", "", "literal"]);
  });
  it("supports tokens embedded in text and numbers", () => {
    expect(resolveTokens(["Hello {{ firstName }}, you have {{count}} matches"], { firstName: "Ali", count: 3 })).toEqual(["Hello Ali, you have 3 matches"]);
  });
});

describe("sanitizeTemplateParam", () => {
  it("removes newlines/tabs, collapses runs of spaces and caps length", () => {
    expect(sanitizeTemplateParam("a\nb\tc      d")).toBe("a b c    d");
    expect(sanitizeTemplateParam("x".repeat(2000))).toHaveLength(1024);
  });
});

describe("firstNameOf", () => {
  it("takes the first word and falls back to 'there'", () => {
    expect(firstNameOf("Sara Al Mansoori")).toBe("Sara");
    expect(firstNameOf("")).toBe("there");
    expect(firstNameOf(undefined)).toBe("there");
  });
});
