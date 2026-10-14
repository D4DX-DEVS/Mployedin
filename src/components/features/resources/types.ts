export interface ResourceFile {
  fileName: string;
  /** Signed, short-lived preview URL issued by the API (the stored URL is private). */
  url: string;
  key: string;
  contentType: string;
  size: number;
}

export interface Resource {
  _id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  accessLevel: string;
  version: number;
  downloadCount: number;
  files: ResourceFile[];
  uploadedBy?: { _id: string; name?: string } | string | null;
  versionHistory?: { version: number; uploadedAt?: string }[];
  createdAt: string;
  updatedAt?: string;
}

export const RESOURCE_CATEGORY_KEYS = [
  "standee_designs", "brochures", "flyers", "employer_kits", "candidate_forms",
  "booth_designs", "presentation_decks", "exhibition_videos", "contracts",
  "vendor_documents", "travel_templates", "branding_assets", "compliance_docs", "other",
] as const;
