import { splitAssistantReply } from "@/lib/ai/draftDisplay";

describe("splitAssistantReply", () => {
  it("leaves a plain answer alone", () => {
    expect(splitAssistantReply("Which country is this role in?")).toEqual({
      text: "Which country is this role in?",
      hasDraft: false,
      isWritingDraft: false,
    });
  });

  it("removes a finished draft block and reports it", () => {
    const reply = splitAssistantReply('Here is the draft.<JOB_DATA>{"title":"Science Teacher"}</JOB_DATA>');
    expect(reply).toEqual({ text: "Here is the draft.", hasDraft: true, isWritingDraft: false });
  });

  it("removes a finished bulk block", () => {
    const reply = splitAssistantReply('Two jobs.\n<BULK_JOB_DATA>[{"title":"Driver"}]</BULK_JOB_DATA>');
    expect(reply).toEqual({ text: "Two jobs.", hasDraft: true, isWritingDraft: false });
  });

  it("hides a draft block that is still streaming", () => {
    const reply = splitAssistantReply('Here is the draft.\n<JOB_DATA>{\n"title": "Science Teacher",\n"category": "Educ');
    expect(reply.text).toBe("Here is the draft.");
    expect(reply.text).not.toContain("title");
    expect(reply).toMatchObject({ hasDraft: false, isWritingDraft: true });
  });

  it("hides a bulk block that is still streaming", () => {
    const reply = splitAssistantReply('Two jobs.<BULK_JOB_DATA>[{"title":"Dri');
    expect(reply).toEqual({ text: "Two jobs.", hasDraft: false, isWritingDraft: true });
  });

  it.each(["<JOB", "<JOB_DATA", "<BULK_JOB_"])("hides the opening tag while it is arriving (%s)", (partial) => {
    const reply = splitAssistantReply(`Here is the draft. ${partial}`);
    expect(reply).toEqual({ text: "Here is the draft.", hasDraft: false, isWritingDraft: true });
  });

  it("keeps ordinary angle brackets in an answer", () => {
    expect(splitAssistantReply("Experience < 5 years is fine").text).toBe("Experience < 5 years is fine");
    expect(splitAssistantReply("Salary <").isWritingDraft).toBe(false);
  });

  it("drops the code fence a model opens around the block", () => {
    expect(splitAssistantReply('Draft below.\n```json\n<JOB_DATA>{"title":').text).toBe("Draft below.");
    expect(splitAssistantReply('Draft below.\n```json\n<JOB_DATA>{"title":"Driver"}</JOB_DATA>\n```').text).toBe("Draft below.");
  });
});
