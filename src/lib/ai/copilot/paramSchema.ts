/**
 * Minimal parameter-schema DSL for Copilot tools.
 *
 * Each tool declares its arguments with this small set of primitive shapes
 * instead of a full zod schema. The same definition is used to:
 *   1. Generate the OpenAI/OpenRouter-compatible JSON Schema handed to the model.
 *   2. Validate + coerce the model's tool-call arguments at execute time.
 *
 * Kept deliberately tiny (string/number/boolean/array<string>) — every
 * Copilot tool argument fits one of these shapes. If a tool ever needs a
 * nested object, extend this file rather than reaching for a full zod schema.
 */

export type ParamDef =
  | { type: "string"; description: string; optional?: boolean; enum?: string[]; maxLength?: number }
  | { type: "number"; description: string; optional?: boolean; min?: number; max?: number }
  | { type: "boolean"; description: string; optional?: boolean }
  | { type: "array"; description: string; items: { type: "string" }; optional?: boolean; maxItems?: number };

export type ParamSchema = Record<string, ParamDef>;

/** Convert a ParamSchema into the JSON Schema object OpenRouter's function-calling expects. */
export function toJsonSchema(schema: ParamSchema): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, def] of Object.entries(schema)) {
    if (!def.optional) required.push(key);

    if (def.type === "string") {
      properties[key] = {
        type: "string",
        description: def.description,
        ...(def.enum ? { enum: def.enum } : {}),
      };
    } else if (def.type === "number") {
      properties[key] = {
        type: "number",
        description: def.description,
        ...(def.min !== undefined ? { minimum: def.min } : {}),
        ...(def.max !== undefined ? { maximum: def.max } : {}),
      };
    } else if (def.type === "boolean") {
      properties[key] = { type: "boolean", description: def.description };
    } else {
      properties[key] = {
        type: "array",
        description: def.description,
        items: { type: "string" },
      };
    }
  }

  return { type: "object", properties, required };
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Validate + coerce raw (untrusted, model-produced) args against a ParamSchema.
 * Unknown keys are dropped rather than rejected — models sometimes add stray fields.
 */
export function validateArgs<T = Record<string, unknown>>(
  schema: ParamSchema,
  raw: unknown
): ValidationResult<T> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Arguments must be a JSON object" };
  }
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const val = input[key];

    if (val === undefined || val === null) {
      if (!def.optional) return { ok: false, error: `Missing required argument "${key}"` };
      continue;
    }

    if (def.type === "string") {
      if (typeof val !== "string") return { ok: false, error: `"${key}" must be a string` };
      const trimmed = val.trim();
      if (def.maxLength && trimmed.length > def.maxLength) {
        return { ok: false, error: `"${key}" exceeds max length of ${def.maxLength}` };
      }
      if (def.enum && !def.enum.includes(trimmed)) {
        return { ok: false, error: `"${key}" must be one of: ${def.enum.join(", ")}` };
      }
      out[key] = trimmed;
    } else if (def.type === "number") {
      const num = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(num)) return { ok: false, error: `"${key}" must be a number` };
      if (def.min !== undefined && num < def.min) return { ok: false, error: `"${key}" must be >= ${def.min}` };
      if (def.max !== undefined && num > def.max) return { ok: false, error: `"${key}" must be <= ${def.max}` };
      out[key] = num;
    } else if (def.type === "boolean") {
      if (typeof val !== "boolean") return { ok: false, error: `"${key}" must be a boolean` };
      out[key] = val;
    } else {
      if (!Array.isArray(val) || !val.every((v) => typeof v === "string")) {
        return { ok: false, error: `"${key}" must be an array of strings` };
      }
      if (def.maxItems && val.length > def.maxItems) {
        return { ok: false, error: `"${key}" exceeds max items of ${def.maxItems}` };
      }
      out[key] = val.map((v) => v.trim());
    }
  }

  return { ok: true, value: out as T };
}
