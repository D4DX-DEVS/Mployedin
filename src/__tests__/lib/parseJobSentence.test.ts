import { parseJobSentence } from "@/lib/public/parseJobSentence";

describe("parseJobSentence", () => {
  it.each([
    ["Site engineer in Dubai", { search: "Site engineer", location: "Dubai" }],
    ["Nursing roles in Abu Dhabi", { search: "Nursing", location: "Abu Dhabi" }],
    ["Remote design jobs", { search: "design", location: "Remote" }],
    ["hotel supervisor in qatar", { search: "hotel supervisor", location: "Qatar" }],
    ["Hotel supervisor in Qatar, live-in", { search: "Hotel supervisor live-in", location: "Qatar" }],
    ["accountant near Sharjah with family visa", { search: "accountant with family visa", location: "Sharjah" }],
    ["software developer working from home", { search: "software developer", location: "Remote" }],
    ["engineer", { search: "engineer", location: "" }],
    ["jobs in UAE", { search: "", location: "UAE" }],
    ["مهندس موقع في دبي", { search: "مهندس موقع", location: "دبي" }],
  ])("reads %j", (sentence, expected) => {
    expect(parseJobSentence(sentence)).toEqual(expected);
  });

  it("returns nothing for an empty or blank sentence", () => {
    expect(parseJobSentence("")).toEqual({ search: "", location: "" });
    expect(parseJobSentence("   ")).toEqual({ search: "", location: "" });
  });

  it("never puts the filler word alone into the keyword", () => {
    expect(parseJobSentence("jobs").search).toBe("jobs");
    expect(parseJobSentence("remote jobs")).toEqual({ search: "", location: "Remote" });
  });
});
