import { cvOwnerMismatch, namesMatch } from "@/lib/cv/cvOwnerCheck";

describe("namesMatch", () => {
  it.each([
    ["Mohammed Ali", "Mohammed Ali"],
    ["Mohammed Ali", "MOHAMMED  ALI"],
    ["Muhammad Ali Khan", "Mohamed Ali"],
    ["Md Rahman", "Mohammed Rahman"],
    ["Yousef Hassan", "Yusuf Hasan"],
    ["Hussain Ahmed Al Mansouri", "Hussein Al-Mansouri"],
    ["José García", "Jose Garcia"],
    ["Ali", "Ali Abdullah Saeed"],
    ["Mohammed Hassan", "Mohammed Ahmed Ali Hassan"],
    ["محمد علي", "محمّد علي"],
    ["أحمد الحسن", "احمد حسن"],
    ["Fatima Zahra", "fatima-zahra"],
  ])("%s ↔ %s is the same person", (a, b) => {
    expect(namesMatch(a, b)).toBe(true);
  });

  it.each([
    ["Mohammed Ali", "Mohammed Khan"],
    ["Ilyas Khan", "Rahul Sharma"],
    ["Sara Ahmed", "John Smith"],
    ["محمد علي", "خالد سعيد"],
  ])("%s ↔ %s is someone else", (a, b) => {
    expect(namesMatch(a, b)).toBe(false);
  });

  it("cannot compare Arabic with English, so does not flag it", () => {
    expect(namesMatch("محمد علي", "Rahul Sharma")).toBe(true);
  });
});

describe("cvOwnerMismatch", () => {
  it("flags a CV with another person's name, and passes on its email", () => {
    expect(
      cvOwnerMismatch({
        accountName: "Ilyas Khan",
        accountEmail: "ilyas@example.com",
        cvName: "Rahul Sharma",
        cvEmail: "Rahul@Example.com",
      }),
    ).toEqual({ cvName: "Rahul Sharma", accountName: "Ilyas Khan", cvEmail: "rahul@example.com" });
  });

  it("trusts a CV whose email is the account's, whatever name it gives", () => {
    expect(
      cvOwnerMismatch({ accountName: "Ilyas Khan", accountEmail: "ilyas@example.com", cvName: "I. K.", cvEmail: "ILYAS@example.com" }),
    ).toBeNull();
  });

  it("does not flag a different email alone (people keep more than one)", () => {
    expect(
      cvOwnerMismatch({ accountName: "Ilyas Khan", accountEmail: "ilyas@example.com", cvName: "Ilyas Khan", cvEmail: "ik@work.com" }),
    ).toBeNull();
  });

  it("cannot judge without both names", () => {
    expect(cvOwnerMismatch({ accountName: "", cvName: "Rahul Sharma" })).toBeNull();
    expect(cvOwnerMismatch({ accountName: "Ilyas Khan", cvName: undefined })).toBeNull();
  });
});
