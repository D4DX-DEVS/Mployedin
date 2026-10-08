/**
 * Machine-readable description of the AI Data Access API. `/schema` is what an
 * LLM should read first; `/openapi.json` is the same surface as OpenAPI 3.1 for
 * ChatGPT Actions / n8n / codegen. Both are generated from the entity registry,
 * so they cannot drift from what the handlers actually return.
 */
import { getAppBaseUrl } from "@/lib/mcp/baseUrl";
import { ENTITIES } from "./entities";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./params";
import { QUERY_METRIC_OPS } from "./query";
import { TIMESERIES_INTERVALS, TIMESERIES_METRICS } from "./timeseries";
import type { EntityDef, FieldType } from "./types";

export const INSIGHTS_VERSION = "1.0.0";

export function insightsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  try {
    if (configured) return new URL(configured).origin;
  } catch {
    // fall through
  }
  return getAppBaseUrl();
}

const COMMON_LIST_PARAMS = [
  { name: "limit", type: "integer", desc: `Page size, default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.` },
  { name: "page", type: "integer", desc: "1-based page for offset pagination." },
  { name: "cursor", type: "string", desc: "Keyset pagination: send `start`, then the returned nextCursor. Ordered by _id desc. Not combinable with sort." },
  { name: "from", type: "date-time", desc: "ISO date; records with dateField ≥ from." },
  { name: "to", type: "date-time", desc: "ISO date; records with dateField ≤ to." },
  { name: "sort", type: "string", desc: "One sortable field; prefix - for descending. Default -dateField." },
  { name: "fields", type: "string", desc: "Comma list of fields to return (_id always included). Also unlocks detailOnly fields." },
  { name: "q", type: "string", desc: "Case-insensitive substring search over the entity's search fields." },
];

export function describeEntity(e: EntityDef) {
  return {
    key: e.key,
    label: e.label,
    description: e.description,
    list: `/api/insights/${e.key}`,
    detail: `/api/insights/${e.key}/{id}`,
    dateField: e.dateField,
    sortable: e.sortable,
    search: (e.searchFields ?? []).map((s) => (s.pii ? `${s.path} (pii:read)` : s.path)),
    filters: e.filters.map((fd) => ({
      param: fd.param,
      type: fd.type,
      description: fd.desc,
      ...(fd.enum ? { enum: fd.enum } : {}),
      ...(fd.pii ? { requiresScope: "pii:read" } : {}),
    })),
    groupable: e.groupable,
    numeric: e.numeric,
    fields: e.fields.map((fd) => ({
      name: fd.name,
      type: fd.type,
      description: fd.desc,
      ...(fd.enum ? { enum: fd.enum } : {}),
      ...(fd.pii ? { pii: fd.pii, redactedWithout: "pii:read" } : {}),
      ...(fd.detailOnly ? { detailOnly: true } : {}),
    })),
  };
}

export function buildIndex() {
  const base = insightsBaseUrl();
  return {
    name: "Mployedin AI Data Access",
    version: INSIGHTS_VERSION,
    description:
      "Read-only, key-protected access to Mployedin recruitment data for AI assistants and automations. Start with /api/insights/schema.",
    auth: "Authorization: Bearer mpi_… (or x-api-key header). Scopes: insights:read (required), pii:read (un-redacts names/e-mails/phones).",
    schema: `${base}/api/insights/schema`,
    openapi: `${base}/api/insights/openapi.json`,
    mcp: { url: `${base}/api/mcp`, scope: "read:insights", auth: "OAuth 2.1 (admin accounts only)" },
    endpoints: [
      { method: "GET", path: "/api/insights/overview", description: "Platform KPIs with 30-day trends." },
      { method: "GET", path: "/api/insights/timeseries", description: "Metric over time: ?metric=&interval=day|week|month&from=&to=" },
      { method: "GET", path: "/api/insights/query", description: "Safe group-by aggregation: ?entity=&groupBy=&metric=&filters=" },
      { method: "GET", path: "/api/insights/search", description: "Cross-entity name search: ?q=" },
      ...ENTITIES.flatMap((e) => [
        { method: "GET", path: `/api/insights/${e.key}`, description: `List ${e.label.toLowerCase()}.` },
        { method: "GET", path: `/api/insights/${e.key}/{id}`, description: `One ${e.label.toLowerCase().replace(/s$/, "")} by id.` },
      ]),
    ],
  };
}

export function buildSchema() {
  return {
    ...buildIndex(),
    conventions: {
      responseShape: "Lists return { data, page, limit, total, nextCursor? }. Errors return { error, code } with HTTP 400/401/403/404/429.",
      dates: "All dates are ISO 8601 UTC strings. from/to filter on each entity's dateField.",
      ids: "Ids are 24-hex ObjectIds. *Id fields reference other entities (employerId → /employers/{id}, jobId → /jobs/{id}, jobSeekerId → /job-seekers/{id}, agentId → /agents/{id}).",
      money: "Amounts are in the record's currency. Never add different currencies together.",
      pii: "Without pii:read, names become initials, e-mails become a***@domain, phones keep the last 2 digits, IPs keep the first two octets.",
      neverReturned: "Password hashes, tokens, secrets, 2FA material, API key hashes, CV/document file URLs, private notes.",
      multiValueFilters: "Equality filters accept a|b for either value.",
    },
    commonListParams: COMMON_LIST_PARAMS,
    overview: {
      path: "/api/insights/overview",
      description: "Counts by status for every entity, money totals by currency, MRR, and 30-day trends (current vs previous 30 days).",
    },
    timeseries: {
      path: "/api/insights/timeseries",
      params: {
        metric: Object.fromEntries(Object.entries(TIMESERIES_METRICS).map(([k, v]) => [k, v.desc])),
        interval: TIMESERIES_INTERVALS,
        from: "ISO date (default: 30 days / 12 weeks / 12 months back)",
        to: "ISO date (default: now)",
        currency: "3-letter code; only for invoices_paid_amount",
      },
      returns: "{ metric, interval, from, to, total, points: [{ t, value }] } — t is the UTC bucket start (weeks start Monday).",
    },
    query: {
      path: "/api/insights/query",
      params: {
        entity: "Entity key (see entities).",
        groupBy: "0–2 comma-separated paths from the entity's groupable list, or <dateField>:day|week|month|year.",
        metric: `count (default) or ${QUERY_METRIC_OPS.join("|")}:<numeric path>.`,
        filters: "field:value[,field:value] using the entity's filter params, e.g. status:active|paused,country:UAE.",
        from: "ISO date on dateField.",
        to: "ISO date on dateField.",
        limit: "Max groups, default 50, max 200.",
        labels: "true to add <field>_label names for employerId/jobId/planId (and user names with pii:read).",
      },
      returns: "{ entity, groupBy, metric, filters, truncated, data: [{ <group fields>, value, records }] }",
    },
    search: {
      path: "/api/insights/search",
      params: { q: "≥ 2 characters." },
      returns: "{ jobs, employers, leads, users } — top 10 each; users only with pii:read.",
    },
    entities: ENTITIES.map(describeEntity),
  };
}

const OAS_TYPES: Record<FieldType, Record<string, unknown>> = {
  string: { type: ["string", "null"] },
  number: { type: ["number", "null"] },
  boolean: { type: ["boolean", "null"] },
  date: { type: ["string", "null"], format: "date-time" },
  objectId: { type: ["string", "null"], pattern: "^[a-f0-9]{24}$" },
  array: { type: ["array", "null"], items: {} },
  object: { type: ["object", "null"] },
};

function schemaName(e: EntityDef): string {
  return e.label.replace(/[^A-Za-z]/g, "");
}

export function buildOpenApi() {
  const base = insightsBaseUrl();
  const errorRef = { $ref: "#/components/schemas/Error" };
  const errorResponses = {
    "400": { description: "Invalid parameter", content: { "application/json": { schema: errorRef } } },
    "401": { description: "Missing or invalid key", content: { "application/json": { schema: errorRef } } },
    "403": { description: "Key revoked/expired or scope missing", content: { "application/json": { schema: errorRef } } },
    "429": { description: "Rate limited", content: { "application/json": { schema: errorRef } } },
  };
  const qp = (name: string, description: string, schema: Record<string, unknown> = { type: "string" }, required = false) => ({
    name,
    in: "query",
    required,
    description,
    schema,
  });
  const commonParams = [
    qp("limit", `Page size (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`, { type: "integer", minimum: 1, maximum: MAX_LIMIT }),
    qp("page", "1-based page.", { type: "integer", minimum: 1 }),
    qp("cursor", "Keyset pagination: `start`, then nextCursor."),
    qp("from", "ISO date lower bound on the entity's dateField.", { type: "string", format: "date-time" }),
    qp("to", "ISO date upper bound on the entity's dateField.", { type: "string", format: "date-time" }),
    qp("fields", "Comma-separated fields to return."),
    qp("q", "Substring search."),
  ];
  const genericObject = { type: "object", additionalProperties: true };

  const paths: Record<string, unknown> = {
    "/api/insights": {
      get: { operationId: "getIndex", summary: "List endpoints", responses: { "200": { description: "Index", content: { "application/json": { schema: genericObject } } }, ...errorResponses } },
    },
    "/api/insights/schema": {
      get: {
        operationId: "getSchema",
        summary: "Describe every entity, field, filter and endpoint. Call this first.",
        responses: { "200": { description: "Schema", content: { "application/json": { schema: genericObject } } }, ...errorResponses },
      },
    },
    "/api/insights/overview": {
      get: {
        operationId: "getOverview",
        summary: "Platform KPIs: counts by status, money by currency, MRR, 30-day trends.",
        responses: { "200": { description: "Overview", content: { "application/json": { schema: genericObject } } }, ...errorResponses },
      },
    },
    "/api/insights/timeseries": {
      get: {
        operationId: "getTimeseries",
        summary: "A metric bucketed over time.",
        parameters: [
          qp("metric", "Metric to plot.", { type: "string", enum: Object.keys(TIMESERIES_METRICS) }, true),
          qp("interval", "Bucket size.", { type: "string", enum: TIMESERIES_INTERVALS, default: "day" }),
          qp("from", "ISO start.", { type: "string", format: "date-time" }),
          qp("to", "ISO end.", { type: "string", format: "date-time" }),
          qp("currency", "3-letter currency (invoices_paid_amount only)."),
        ],
        responses: {
          "200": {
            description: "Series",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    metric: { type: "string" },
                    interval: { type: "string" },
                    total: { type: "number" },
                    points: { type: "array", items: { type: "object", properties: { t: { type: "string", format: "date-time" }, value: { type: "number" } } } },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    "/api/insights/query": {
      get: {
        operationId: "runQuery",
        summary: "Group-by aggregation over one entity (whitelisted fields only). See /schema → query and each entity's groupable/numeric lists.",
        parameters: [
          qp("entity", "Entity key.", { type: "string", enum: ENTITIES.map((e) => e.key) }, true),
          qp("groupBy", "0–2 comma-separated groupable paths, or createdAt:day|week|month|year."),
          qp("metric", "count, or sum|avg|min|max:<numeric path>.", { type: "string", default: "count" }),
          qp("filters", "field:value[,field:value], values may use a|b."),
          qp("from", "ISO start on dateField.", { type: "string", format: "date-time" }),
          qp("to", "ISO end on dateField.", { type: "string", format: "date-time" }),
          qp("limit", "Max groups (≤ 200).", { type: "integer", minimum: 1, maximum: 200 }),
          qp("labels", "Add *_label names for id groups.", { type: "boolean" }),
        ],
        responses: { "200": { description: "Groups", content: { "application/json": { schema: genericObject } } }, ...errorResponses },
      },
    },
    "/api/insights/search": {
      get: {
        operationId: "search",
        summary: "Find jobs, employers, leads (and users with pii:read) by name.",
        parameters: [qp("q", "Search text (≥ 2 chars).", { type: "string", minLength: 2 }, true)],
        responses: { "200": { description: "Matches", content: { "application/json": { schema: genericObject } } }, ...errorResponses },
      },
    },
  };

  const schemas: Record<string, unknown> = {
    Error: {
      type: "object",
      required: ["error", "code"],
      properties: { error: { type: "string" }, code: { type: "string" } },
    },
  };

  for (const e of ENTITIES) {
    const name = schemaName(e);
    schemas[name] = {
      type: "object",
      description: e.description,
      properties: Object.fromEntries(
        e.fields.map((fd) => [
          fd.name,
          {
            ...OAS_TYPES[fd.type],
            description: `${fd.desc}${fd.pii ? " (PII — redacted without pii:read)" : ""}${fd.detailOnly ? " (detail / fields= only)" : ""}`,
            ...(fd.enum ? { examples: [fd.enum[0]] } : {}),
          },
        ]),
      ),
    };
    const opBase = e.key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    paths[`/api/insights/${e.key}`] = {
      get: {
        operationId: `list${opBase[0]!.toUpperCase()}${opBase.slice(1)}`,
        summary: `List ${e.label.toLowerCase()}. ${e.description}`,
        parameters: [
          ...commonParams,
          qp("sort", `One of ${e.sortable.join(", ")}; prefix - for descending.`),
          ...e.filters.map((fd) =>
            qp(
              fd.param,
              `${fd.desc}${fd.pii ? " Requires pii:read." : ""}`,
              fd.type === "number" ? { type: "number" } : fd.type === "boolean" && !fd.valueMap ? { type: "boolean" } : { type: "string", ...(fd.enum ? { examples: [fd.enum[0]] } : {}) },
            ),
          ),
        ],
        responses: {
          "200": {
            description: "Page of records",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: `#/components/schemas/${name}` } },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    nextCursor: { type: ["string", "null"] },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    };
    paths[`/api/insights/${e.key}/{id}`] = {
      get: {
        operationId: `get${opBase[0]!.toUpperCase()}${opBase.slice(1)}ById`,
        summary: `One ${e.label.toLowerCase()} record with all fields.`,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-f0-9]{24}$" } },
          qp("fields", "Comma-separated fields to return."),
        ],
        responses: {
          "200": {
            description: "Record",
            content: { "application/json": { schema: { type: "object", properties: { data: { $ref: `#/components/schemas/${name}` } } } } },
          },
          "404": { description: "Not found", content: { "application/json": { schema: errorRef } } },
          ...errorResponses,
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Mployedin AI Data Access",
      version: INSIGHTS_VERSION,
      description:
        "Read-only recruitment platform data for AI assistants. Call getSchema first. All responses are JSON; money is per currency; PII is redacted unless the key holds pii:read.",
    },
    servers: [{ url: base }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "mpi_ API key", description: "Authorization: Bearer mpi_…" },
      },
      schemas,
    },
    paths,
  };
}
