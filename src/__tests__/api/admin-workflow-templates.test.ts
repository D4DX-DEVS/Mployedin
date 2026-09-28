/**
 * @jest-environment node
 *
 * Admin workflow templates: POST creates v1, PATCH bumps version, POST action
 * duplicates/archives/sets default, DELETE only unused templates.
 */
import { NextRequest } from "next/server";

const ADMIN_USER = "64b000000000000000000001";
const TEMPLATE_ID = "64b000000000000000000201";
const JOB_ID = "64b000000000000000000101";

let templates: Record<string, unknown>[] = [];
let jobs: Record<string, unknown>[] = [];

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));

jest.mock("@/models/WorkflowTemplate", () => ({
  __esModule: true,
  default: {
    find: jest.fn(async () => ({
      sort: jest.fn(() => ({ lean: async () => templates.filter((t) => (t as any).scope === "system") })),
    })),
    create: jest.fn(async (doc: Record<string, unknown>) => {
      const template = { _id: TEMPLATE_ID, ...doc, createdAt: new Date(), updatedAt: new Date(), toObject: () => template };
      templates.push(template);
      return template;
    }),
    findOne: jest.fn((query: Record<string, unknown>) => ({
      lean: async () => {
        const t = templates.find((t) => String(t._id) === String(query._id) && (query.scope ? (t as any).scope === query.scope : true));
        return t || null;
      },
    })),
    findOneAndUpdate: jest.fn((query: Record<string, unknown>, update: Record<string, unknown>) => ({
      lean: async () => {
        const template = templates.find((t) => String(t._id) === String(query._id));
        if (!template) return null;
        const $set = (update as any).$set || {};
        const $inc = (update as any).$inc || {};
        Object.assign(template, $set);
        if ($inc.version) template.version = ((template.version as number) || 0) + $inc.version;
        return template;
      },
    })),
    findOneAndDelete: jest.fn((query: Record<string, unknown>) => ({
      lean: async () => {
        const idx = templates.findIndex((t) => String(t._id) === String(query._id));
        if (idx === -1) return null;
        return templates.splice(idx, 1)[0];
      },
    })),
    updateMany: jest.fn(async () => {
      templates.forEach((t) => {
        if ((t as any).isDefault && (t as any).scope === "system") {
          (t as any).isDefault = false;
        }
      });
      return { modifiedCount: templates.length };
    }),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    aggregate: jest.fn(async () => {
      const matches = jobs.filter((j) => String((j as any).workflow?.template?.templateId) === TEMPLATE_ID && !(j as any).deletedAt);
      return matches.length > 0 ? [{ _id: TEMPLATE_ID, count: matches.length }] : [];
    }),
    distinct: jest.fn(async () => ["Engineering", "Sales"]),
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context?.params ? await context.params : {};
      try {
        return await handler(req, { userId: ADMIN_USER, role: "admin", locale: "en" }, params);
      } catch (err: unknown) {
        if (err instanceof Response) return err;
        throw err;
      }
    },
}));

describe("Admin Workflow Templates API", () => {
  beforeEach(() => {
    templates = [];
    jobs = [];
  });

  function req(url: string, method = "GET", body?: unknown) {
    return new NextRequest(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("creates a template with version 1", async () => {
    const { POST } = await import("@/app/api/admin/workflow-templates/route");
    const res = await POST(
      req("http://localhost:3000/api/admin/workflow-templates", "POST", {
        name: "Test Template",
        description: "Test desc",
        stages: [
          { id: "applied", label: "Applied", phase: "applied" },
          { id: "hired", label: "Hired", phase: "hired" },
        ],
      }),
      { params: Promise.resolve({}) },
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.template.version).toBe(1);
    expect(data.template.name).toBe("Test Template");
  });

  it("clears other defaults when creating a default template", async () => {
    templates.push({
      _id: "existing-id",
      name: "Existing",
      scope: "system",
      isDefault: true,
      version: 1,
    });

    const { POST } = await import("@/app/api/admin/workflow-templates/route");
    await POST(
      req("http://localhost:3000/api/admin/workflow-templates", "POST", {
        name: "New Default",
        description: "",
        stages: [
          { id: "applied", label: "Applied", phase: "applied" },
          { id: "hired", label: "Hired", phase: "hired" },
        ],
        isDefault: true,
      }),
      { params: Promise.resolve({}) },
    );

    expect(templates[0].isDefault).toBe(false);
  });

  it("bumps version on PATCH", async () => {
    templates.push({
      _id: TEMPLATE_ID,
      name: "Original",
      description: "desc",
      scope: "system",
      isDefault: false,
      version: 1,
      stages: [
        { id: "applied", label: "Applied", phase: "applied", order: 1 },
        { id: "hired", label: "Hired", phase: "hired", order: 2 },
      ],
    });

    const { PATCH } = await import("@/app/api/admin/workflow-templates/[id]/route");
    const res = await PATCH(
      req("http://localhost:3000/api/admin/workflow-templates/" + TEMPLATE_ID, "PATCH", {
        name: "Updated",
        description: "new desc",
        stages: [
          { id: "applied", label: "Applied", phase: "applied" },
          { id: "hired", label: "Hired", phase: "hired" },
        ],
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.template.version).toBeGreaterThan(1);
  });

  it("duplicates a template with (copy) suffix", async () => {
    templates.push({
      _id: TEMPLATE_ID,
      name: "Original",
      scope: "system",
      isDefault: false,
      isActive: true,
      version: 1,
      stages: [{ id: "applied", label: "Applied", phase: "applied", order: 1 }],
      tags: [],
      description: "test",
    });

    const { POST } = await import("@/app/api/admin/workflow-templates/[id]/route");
    const res = await POST(
      req("http://localhost:3000/api/admin/workflow-templates/" + TEMPLATE_ID, "POST", {
        action: "duplicate",
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) },
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.template.name).toContain("(copy)");
    expect(data.template.version).toBe(1);
  });

  it("returns 409 when setting_default on archived template", async () => {
    templates.push({
      _id: TEMPLATE_ID,
      name: "Archived",
      scope: "system",
      isDefault: false,
      isActive: false,
      version: 1,
    });

    const { POST } = await import("@/app/api/admin/workflow-templates/[id]/route");
    const res = await POST(
      req("http://localhost:3000/api/admin/workflow-templates/" + TEMPLATE_ID, "POST", {
        action: "set_default",
      }),
      { params: Promise.resolve({ id: TEMPLATE_ID }) },
    );
    expect(res.status).toBe(409);
  });

  it("deletes unused template", async () => {
    templates.push({
      _id: TEMPLATE_ID,
      name: "Template",
      scope: "system",
      version: 1,
    });

    const { DELETE } = await import("@/app/api/admin/workflow-templates/[id]/route");
    const res = await DELETE(
      req("http://localhost:3000/api/admin/workflow-templates/" + TEMPLATE_ID, "DELETE"),
      { params: Promise.resolve({ id: TEMPLATE_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when deleting template used by jobs", async () => {
    templates.push({
      _id: TEMPLATE_ID,
      name: "Template",
      scope: "system",
      version: 1,
    });
    jobs.push({
      _id: JOB_ID,
      workflow: { template: { templateId: TEMPLATE_ID } },
    });

    const { DELETE } = await import("@/app/api/admin/workflow-templates/[id]/route");
    const res = await DELETE(
      req("http://localhost:3000/api/admin/workflow-templates/" + TEMPLATE_ID, "DELETE"),
      { params: Promise.resolve({ id: TEMPLATE_ID }) },
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toBe("TEMPLATE_IN_USE");
  });
});
