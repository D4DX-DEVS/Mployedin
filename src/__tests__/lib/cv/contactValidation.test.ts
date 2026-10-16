import { cleanContact } from "@/lib/cv/contactValidation";

describe("cleanContact", () => {
  it("keeps a valid email and phone as read", () => {
    expect(cleanContact({ email: "anagha.d@gmail.com", phone: "+971 50 123 4567" })).toEqual({
      email: "anagha.d@gmail.com",
      phone: "+971 50 123 4567",
      dropped: [],
    });
  });

  it("joins an email OCR split around '@' and dots", () => {
    expect(cleanContact({ email: "anagha.d @ gmail . com" }).email).toBe("anagha.d@gmail.com");
  });

  it("takes the first valid address when the CV lists two", () => {
    expect(cleanContact({ email: "mailto:rami@x.co / rami.alt@y.com" }).email).toBe("rami@x.co");
  });

  it.each(["anagha@gmail", "an..agha@gmail.com", "anagha.gmail.com", "LinkedIn"])(
    "drops a malformed email (%s) instead of guessing",
    (email) => {
      expect(cleanContact({ email })).toEqual({ dropped: ["email"] });
    },
  );

  it("keeps a phone with a label or two numbers for onboarding's parser to split", () => {
    const phone = "Mob: +91 98765 43210 / +971 50 123 4567";
    expect(cleanContact({ phone }).phone).toBe(phone);
  });

  it.each(["20013", "Call me", "12-34"])("drops a phone with no plausible number (%s)", (phone) => {
    expect(cleanContact({ phone })).toEqual({ dropped: ["phone"] });
  });

  it("ignores absent, empty and non-text values", () => {
    expect(cleanContact({})).toEqual({ dropped: [] });
    expect(cleanContact({ email: "  ", phone: 971501234567 })).toEqual({ dropped: [] });
  });
});

describe("cleanContact: correct emails that must be kept", () => {
  it.each([
    ["a sentence full stop", "name@x.com.", "name@x.com"],
    ["round brackets", "(name@x.com)", "name@x.com"],
    ["angle brackets", "<name@x.com>", "name@x.com"],
    ["double quotes", '"name@x.com"', "name@x.com"],
    ["a label with no space", "Email:name@x.com", "name@x.com"],
    ["a label and mailto together", "Email:mailto:name@x.com", "name@x.com"],
    ["a right-to-left mark from Arabic text", "name@x.com\u200F", "name@x.com"],
    ["a zero-width space", "\u200Bname@x.com", "name@x.com"],
    ["a byte-order mark", "\uFEFFname@x.com", "name@x.com"],
    ["a label and a full stop before the next field", "Email: name@x.com. Phone: 050 123 4567", "name@x.com"],
    ["many domain labels", "a.b@mail.sub.x.co.uk", "a.b@mail.sub.x.co.uk"],
    ["capital letters (not lowercased)", "NAME@X.COM", "NAME@X.COM"],
    ["an apostrophe in the name", "o'brien@x.com", "o'brien@x.com"],
    ["curly double quotes", "\u201Cname@x.com\u201D", "name@x.com"],
    ["guillemets", "\u00ABname@x.com\u00BB", "name@x.com"],
    ["single guillemets", "\u2039name@x.com\u203A", "name@x.com"],
    ["a bullet stuck to it", "\u2022name@x.com", "name@x.com"],
    ["an Arabic letter mark", "name@x.com\u061C", "name@x.com"],
    ["a word joiner inside", "name\u2060@x.com", "name@x.com"],
    ["a soft hyphen inside", "na\u00ADme@x.com", "name@x.com"],
    ["an Arabic comma before a second address", "a@x.com\u060Cb@y.com", "a@x.com"],
    ["an Arabic semicolon before a second address", "a@x.com\u061Bb@y.com", "a@x.com"],
  ])("keeps an email with %s", (_label, email, expected) => {
    expect(cleanContact({ email })).toEqual({ email: expected, dropped: [] });
  });

  it.each([
    ["a spaced full stop then a word", "name@x.com . Phone: 050"],
    ["a spaced full stop stuck to the next word", "name@x.com .Phone"],
    ["a label, a spaced full stop and a word", "Email: name@x.com . Phone 050"],
  ])("keeps the address, not address.word, for %s", (_label, email) => {
    expect(cleanContact({ email })).toEqual({ email: "name@x.com", dropped: [] });
  });

  it("still joins an OCR split around '@' and dots", () => {
    expect(cleanContact({ email: "anagha.d @ gmail . com" }).email).toBe("anagha.d@gmail.com");
    expect(cleanContact({ email: "anagha.d@gmail .com" }).email).toBe("anagha.d@gmail.com");
  });
});

describe("cleanContact: emails that must never be invented", () => {
  it("does not fuse a sentence full stop and a space with the next word", () => {
    expect(cleanContact({ email: "Dubai. john@x.com" }).email).toBe("john@x.com");
  });

  it("does not fuse a sentence full stop with an address that also has an OCR split", () => {
    expect(cleanContact({ email: "Based in Dubai. john @ x . com" }).email).toBe("john@x.com");
  });

  it.each(["Dubai . john@x.com", "Based in Dubai . john@x.com"])(
    "does not fuse a spaced full stop with the address after it (%s)",
    (email) => {
      expect(cleanContact({ email })).toEqual({ email: "john@x.com", dropped: [] });
    },
  );

  it.each(["Contact me@gmail. com", "anagha.d@gmail. com"])(
    "drops an address split after the dot only, which is a sentence stop (%s)",
    (email) => {
      expect(cleanContact({ email })).toEqual({ dropped: ["email"] });
    },
  );

  it("does not repair a leading dot", () => {
    expect(cleanContact({ email: ".john@x.com" })).toEqual({ dropped: ["email"] });
  });
});

describe("cleanContact: empty, invisible and oversized values", () => {
  it("ignores a value that is only invisible characters, instead of dropping it", () => {
    expect(cleanContact({ email: "\u200F", phone: "\u200E\u061C\u00AD\u2060" })).toEqual({ dropped: [] });
  });

  it("keeps an email of exactly 320 characters", () => {
    const email = `a@${"b".repeat(314)}.com`;
    expect(email).toHaveLength(320);
    expect(cleanContact({ email })).toEqual({ email, dropped: [] });
  });

  it("drops an email longer than 320 characters before reading it", () => {
    expect(cleanContact({ email: `a@${"b".repeat(315)}.com` })).toEqual({ dropped: ["email"] });
  });

  it("drops a phone field longer than 320 characters", () => {
    expect(cleanContact({ phone: "050 123 4567 ".repeat(30) })).toEqual({ dropped: ["phone"] });
  });
});

describe("cleanContact: correct phones that must be kept", () => {
  it("converts Arabic-Indic digits to ASCII and leaves everything else as given", () => {
    const phone = "+\u0669\u0667\u0661 \u0665\u0660 \u0661\u0662\u0663 \u0664\u0665\u0666\u0667";
    expect(cleanContact({ phone })).toEqual({ phone: "+971 50 123 4567", dropped: [] });
  });

  it("converts Persian digits to ASCII", () => {
    const phone = "\u06F0\u06F5\u06F0 \u06F1\u06F2\u06F3 \u06F4\u06F5\u06F6\u06F7";
    expect(cleanContact({ phone })).toEqual({ phone: "050 123 4567", dropped: [] });
  });

  it.each([
    ["an en dash", "050\u2013123\u20134567"],
    ["a non-breaking hyphen", "050\u2011123\u20114567"],
    ["a figure dash", "050\u2012123\u20124567"],
    ["an em dash", "050\u2014123\u20144567"],
    ["a horizontal bar", "050\u2015123\u20154567"],
    ["a hyphen (U+2010)", "050\u2010123\u20104567"],
    ["a minus sign", "050\u2212123\u22124567"],
    ["round brackets", "(050) 123 4567"],
    ["hyphens and a plus", "+971-50-123-4567"],
  ])("keeps a phone written with %s as given", (_label, phone) => {
    expect(cleanContact({ phone })).toEqual({ phone, dropped: [] });
  });

  it("drops invisible direction marks inside a phone, not the number", () => {
    expect(cleanContact({ phone: "\u200E+971 50\u200F 123 4567\u200F" })).toEqual({
      phone: "+971 50 123 4567",
      dropped: [],
    });
  });
});

describe("cleanContact: phones that stay dropped", () => {
  it("does not let '/' join two short numbers into one long one", () => {
    expect(cleanContact({ phone: "123/4567" })).toEqual({ dropped: ["phone"] });
  });

  it("does not count too few Arabic-Indic digits", () => {
    expect(cleanContact({ phone: "\u0662\u0660\u0660\u0661\u0663" })).toEqual({ dropped: ["phone"] });
  });
});
