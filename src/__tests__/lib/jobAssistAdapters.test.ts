/**
 * @jest-environment node
 *
 * The job assistant writes into two different forms — the create wizard
 * (react-hook-form) and the edit page (plain state). Each must apply exactly
 * the changed fields and undo exactly those.
 */
import { assistChangesToEditPatch, editFormToAssistDraft, mergeEditPatch, type EditJobAssistForm } from "@/components/features/jobs/editJobAssist";
import { applyAssistToWizard, wizardToAssistDraft } from "@/components/features/employer/job-form/jobFormAssist";
import { jobAssistDraftSchema } from "@/lib/ai/jobAssist";

const editForm = (): EditJobAssistForm => ({
  title: "Warehouse Supervisor",
  description: "",
  category: "Logistics",
  location: { country: "Qatar", city: "Doha", isRemote: false },
  requirements: { skills: ["Forklift"], preferredSkills: [], experienceMin: 2, experienceMax: 5 },
  salary: { min: 0, max: 0, currency: "QAR", period: "monthly", isNegotiable: false },
  vacancies: 1,
  employmentType: "",
  workMode: "onsite",
  duration: "",
  responsibilities: [],
  qualifications: [],
  benefits: ["Housing"],
  learningOutcomes: [],
  screeningQuestions: [{ id: "q1", label: "Do you hold a forklift licence?", type: "radio", required: true, options: ["Yes", "No"], placeholder: "" }],
});

describe("edit page adapter", () => {
  it("applies changed fields only, nested groups merged", () => {
    const form = editForm();
    const { patch } = assistChangesToEditPatch(form, {
      benefits: ["Housing", "Annual flight"],
      skills: ["Forklift", "Inventory"],
      salary: { min: 4000, max: 6000 },
    });
    const next = mergeEditPatch(form, patch);
    expect(next.benefits).toEqual(["Housing", "Annual flight"]);
    expect(next.requirements).toEqual({ skills: ["Forklift", "Inventory"], preferredSkills: [], experienceMin: 2, experienceMax: 5 });
    expect(next.salary).toEqual({ min: 4000, max: 6000, currency: "QAR", period: "monthly", isNegotiable: false });
    expect(next.title).toBe("Warehouse Supervisor");
  });

  it("undo restores the replaced values and keeps later edits to other fields", () => {
    const form = editForm();
    const { patch, revert } = assistChangesToEditPatch(form, { description: "Lead the night shift of eight pickers.", experienceMax: 8 });
    const applied = mergeEditPatch(form, patch);
    const editedLater = { ...applied, title: "Night Warehouse Supervisor", requirements: { ...applied.requirements, experienceMin: 3 } };
    const undone = mergeEditPatch(editedLater, revert(editedLater));
    expect(undone.description).toBe("");
    expect(undone.requirements.experienceMax).toBe(5);
    expect(undone.requirements.experienceMin).toBe(3);
    expect(undone.title).toBe("Night Warehouse Supervisor");
  });

  it("adds questions after the existing ones, capped at 20", () => {
    const form = editForm();
    const { patch } = assistChangesToEditPatch(form, {
      addScreeningQuestions: [{ label: "Describe a time you explained a delay to a customer.", type: "textarea", required: true }],
    });
    const next = mergeEditPatch(form, patch);
    expect(next.screeningQuestions).toHaveLength(2);
    expect(next.screeningQuestions[1]).toMatchObject({ label: "Describe a time you explained a delay to a customer.", type: "textarea", options: [], placeholder: "" });

    const full = { ...form, screeningQuestions: Array.from({ length: 20 }, (_, i) => ({ ...form.screeningQuestions[0], id: `q${i}` })) };
    expect(assistChangesToEditPatch(full, { addScreeningQuestions: [{ label: "One more?", type: "text" }] }).patch.screeningQuestions).toBeUndefined();
  });

  it("undo of added questions removes only those, keeping ones added since", () => {
    const form = editForm();
    const { patch, revert } = assistChangesToEditPatch(form, {
      addScreeningQuestions: [{ label: "Are you available for night shifts?", type: "radio", options: ["Yes", "No"] }],
    });
    const applied = mergeEditPatch(form, patch);
    const mine = { id: "q-mine", label: "Your notice period?", type: "text", required: false, options: [], placeholder: "" };
    const editedLater = { ...applied, screeningQuestions: [...applied.screeningQuestions, mine] };
    const undone = mergeEditPatch(editedLater, revert(editedLater));
    expect(undone.screeningQuestions.map((q) => q.id)).toEqual(["q1", "q-mine"]);
  });

  it("cleared number inputs are left out, not sent as NaN", () => {
    const form = { ...editForm(), vacancies: NaN, requirements: { ...editForm().requirements, experienceMax: NaN } };
    const draft = editFormToAssistDraft(form);
    expect(draft.vacancies).toBeUndefined();
    expect(draft.experienceMax).toBeUndefined();
    expect(draft.experienceMin).toBe(2);
  });

  it("switching to remote sets the remote flag", () => {
    const form = editForm();
    const next = mergeEditPatch(form, assistChangesToEditPatch(form, { workMode: "remote" }).patch);
    expect(next.workMode).toBe("remote");
    expect(next.location.isRemote).toBe(true);
    expect(next.location.city).toBe("Doha");
  });
});

describe("wizard adapter", () => {
  function fakeForm(initial: Record<string, unknown>) {
    const values = structuredClone(initial) as Record<string, unknown>;
    const setValue = jest.fn((name: string, value: unknown) => {
      const parts = name.split(".");
      let node = values;
      for (const p of parts.slice(0, -1)) node = node[p] as Record<string, unknown>;
      node[parts[parts.length - 1]] = value;
    });
    return { values, getValues: (() => values) as never, setValue: setValue as never };
  }

  it("applies and undoes, including nested fields", () => {
    const f = fakeForm({
      title: "Chef",
      description: "",
      requirements: { skills: ["Grill"], preferredSkills: [], experienceMin: 0, experienceMax: 10 },
      location: { country: "Oman", city: "Muscat", isRemote: false },
      benefits: [],
      screeningQuestions: [],
    });
    const undo = applyAssistToWizard(
      { description: "Run the grill station for a busy hotel kitchen.", skills: ["Grill", "Food safety"], addScreeningQuestions: [{ label: "How many covers have you cooked for in one service?", type: "number" }] },
      f.getValues,
      f.setValue,
    );
    expect(f.values.description).toBe("Run the grill station for a busy hotel kitchen.");
    expect((f.values.requirements as { skills: string[] }).skills).toEqual(["Grill", "Food safety"]);
    expect(f.values.screeningQuestions).toHaveLength(1);

    // A question the poster adds by hand after the answer survives the undo.
    const mine = { id: "q-mine", label: "Your notice period?", type: "text" };
    f.values.screeningQuestions = [...(f.values.screeningQuestions as unknown[]), mine];

    undo();
    expect(f.values.description).toBe("");
    expect((f.values.requirements as { skills: string[] }).skills).toEqual(["Grill"]);
    expect(f.values.screeningQuestions).toEqual([mine]);
  });

  it("cleared number inputs are left out, not sent as NaN", () => {
    const draft = wizardToAssistDraft({ vacancies: NaN, salary: { min: NaN, max: 5000, currency: "QAR", period: "monthly" } as never });
    expect(draft.vacancies).toBeUndefined();
    expect(draft.salary).toMatchObject({ min: undefined, max: 5000 });
  });
});

describe("request schema", () => {
  it("drops a bad number instead of refusing the whole job", () => {
    const parsed = jobAssistDraftSchema.safeParse({ title: "Chef", vacancies: null, experienceMin: -1, salary: { min: null, max: 4000 } });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ title: "Chef", salary: { max: 4000 } });
    expect(parsed.data?.vacancies).toBeUndefined();
    expect(parsed.data?.experienceMin).toBeUndefined();
  });
});
