import type { Model } from "mongoose";
import type { PiiKind } from "./redact";

export type FieldType = "string" | "number" | "boolean" | "date" | "objectId" | "array" | "object";

export interface FieldDef {
  /** Output key (top level of each returned record). */
  name: string;
  type: FieldType;
  /** One-line semantic description — this is what an LLM reads. */
  desc: string;
  /** Mongo paths to project for this field. Defaults to `[name]`. */
  src?: string[];
  /** Derive the output value from the raw lean document. Defaults to reading `name`. */
  compute?: (doc: Record<string, unknown>) => unknown;
  /** Masked unless the caller holds `pii:read`. */
  pii?: PiiKind;
  /** Omitted from list responses unless named in `fields=`; always in `/{id}`. */
  detailOnly?: boolean;
  /** Allowed values, when the field is an enum (documentation only). */
  enum?: readonly string[];
}

export type FilterOp = "eq" | "ieq" | "gte" | "lte" | "regex" | "prefix";

export interface FilterDef {
  /** Query-string parameter name. */
  param: string;
  /** Mongo path it filters. */
  path: string;
  type: "string" | "objectId" | "boolean" | "number";
  op?: FilterOp;
  desc: string;
  enum?: readonly string[];
  /** Translate raw query values before matching (e.g. status=active → true). */
  valueMap?: Record<string, string | number | boolean>;
  /** Only usable by callers holding `pii:read` (it would otherwise leak PII by probing). */
  pii?: boolean;
}

export interface EntityDef {
  /** URL segment, e.g. "job-seekers". */
  key: string;
  label: string;
  description: string;
  model: () => Model<Record<string, unknown>>;
  fields: FieldDef[];
  filters: FilterDef[];
  /** Field used by `from`/`to` and the default sort. */
  dateField: string;
  sortable: string[];
  /** Paths the `/query` endpoint may group by. */
  groupable: string[];
  /** Numeric paths the `/query` endpoint may sum/avg/min/max. */
  numeric: string[];
  /** Paths searched by `q=` (case-insensitive substring). */
  searchFields?: { path: string; pii?: boolean }[];
  baseFilter?: Record<string, unknown>;
  /** Attach `{ name, email, phone, isActive, lastLogin }` from the owning User. */
  joinUser?: boolean;
}

export interface ListParams {
  page: number;
  limit: number;
  cursor?: string;
  from?: Date;
  to?: Date;
  sort?: string;
  fields?: string[];
  q?: string;
  filters: Record<string, string>;
}

export interface ListResult {
  data: Record<string, unknown>[];
  page: number;
  limit: number;
  total: number;
  nextCursor?: string | null;
}

export interface InsightsAccess {
  pii: boolean;
}
