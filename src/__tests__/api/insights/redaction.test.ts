/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

import { maskValue, sanitizeOutput } from "@/lib/insights/redact";
import { listEntity } from "@/lib/insights/list";
import { parseListParams } from "@/lib/insights/params";
import type { EntityDef } from "@/lib/insights/types";

describe("insights PII redaction", () => {
  it("masks e-mail, phone, name and IP", () => {
    expect(maskValue("email", "jane.doe@example.com")).toBe("j***@example.com");
    expect(maskValue("phone", "+971 50 123 4567")).toBe("***67");
    expect(maskValue("name", "Jane Mary Doe")).toBe("J. M. D.");
    expect(maskValue("ip", "203.0.113.42")).toBe("203.0.x.x");
  });

  it("always strips secrets and masks nested PII without pii:read", () => {
    const out = sanitizeOutput(
      {
        meta: { passwordHash: "x", resetToken: "y", keyHash: "z", email: "a@b.co", note: "contact bob@corp.com" },
        user: { name: "Bob Smith", phone: "0501234567" },
      },
      false,
    ) as Record<string, Record<string, unknown>>;
    expect(out.meta).toEqual({ email: "a***@b.co", note: "contact b***@corp.com" });
    expect(out.user).toEqual({ name: "B. S.", phone: "***67" });
  });

  it("keeps PII with pii:read but still strips secrets", () => {
    const out = sanitizeOutput({ email: "a@b.co", twoFactorSecretEnc: "s", apiKey: "k" }, true);
    expect(out).toEqual({ email: "a@b.co" });
  });

  it("list projects only declared fields and redacts them", async () => {
    const select = jest.fn();
    const rows = [{ _id: "65f0000000000000000000cc", name: "Jane Doe", email: "jane@x.io", passwordHash: "LEAK", role: "admin" }];
    const chain = {
      select: (p: unknown) => { select(p); return chain; },
      sort: () => chain,
      limit: () => chain,
      skip: () => chain,
      lean: () => ({ maxTimeMS: () => Promise.resolve(rows) }),
    };
    const entity: EntityDef = {
      key: "people",
      label: "People",
      description: "test",
      model: () => ({ find: () => chain, countDocuments: () => ({ maxTimeMS: () => Promise.resolve(1) }) }) as never,
      fields: [
        { name: "_id", type: "objectId", desc: "" },
        { name: "name", type: "string", desc: "", pii: "name" },
        { name: "email", type: "string", desc: "", pii: "email" },
        { name: "role", type: "string", desc: "" },
      ],
      filters: [],
      dateField: "createdAt",
      sortable: ["createdAt"],
      groupable: [],
      numeric: [],
    };
    const params = parseListParams(new URLSearchParams("limit=500"), entity);
    expect(params.limit).toBe(200);
    const res = await listEntity(entity, params, { pii: false });
    expect(select).toHaveBeenCalledWith({ _id: 1, name: 1, email: 1, role: 1 });
    expect(res.data[0]).toEqual({ _id: "65f0000000000000000000cc", name: "J. D.", email: "j***@x.io", role: "admin" });
    expect(res).toEqual(expect.objectContaining({ page: 1, limit: 200, total: 1 }));
  });
});
