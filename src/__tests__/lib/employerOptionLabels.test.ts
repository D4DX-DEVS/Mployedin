import { disambiguateEmployerLabels } from "@/lib/employers/optionLabels";

describe("disambiguateEmployerLabels", () => {
  it("appends the account email to a company name that repeats", () => {
    expect(
      disambiguateEmployerLabels([
        { value: "a", label: "Beta Industries", hint: "bob-1@test.com" },
        { value: "b", label: "Beta Industries", hint: "bob-2@test.com" },
        { value: "c", label: "Fazil", hint: "fazil@test.com" },
      ])
    ).toEqual([
      { value: "a", label: "Beta Industries · bob-1@test.com" },
      { value: "b", label: "Beta Industries · bob-2@test.com" },
      { value: "c", label: "Fazil" },
    ]);
  });

  it("treats names that differ only in case or spacing as the same", () => {
    expect(
      disambiguateEmployerLabels([
        { value: "a", label: "D4DX", hint: "one@x.com" },
        { value: "b", label: " d4dx", hint: "two@x.com" },
      ]).map((o) => o.label)
    ).toEqual(["D4DX · one@x.com", " d4dx · two@x.com"]);
  });

  it("leaves a repeated name bare when there is no email to tell it apart", () => {
    expect(
      disambiguateEmployerLabels([
        { value: "a", label: "Gamma" },
        { value: "b", label: "Gamma", hint: "g@x.com" },
      ]).map((o) => o.label)
    ).toEqual(["Gamma", "Gamma · g@x.com"]);
  });
});
