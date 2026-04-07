/**
 * File validation using magic bytes (file signatures).
 * Prevents spoofed file uploads where MIME type is faked.
 */

interface FileSignature {
  mime: string;
  ext: string;
  magic: number[]; // Expected bytes at offset 0
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function hasDocxStructure(buffer: ArrayBuffer): boolean {
  // Entry names are stored as plain text in ZIP headers; this quickly rejects non-DOCX ZIP files.
  const bytes = new Uint8Array(buffer);
  const sample = bytes.slice(0, Math.min(bytes.byteLength, 2 * 1024 * 1024));
  const text = new TextDecoder("latin1").decode(sample);
  return (
    text.includes("[Content_Types].xml") &&
    text.includes("word/document.xml") &&
    text.includes("_rels/.rels")
  );
}

const FILE_SIGNATURES: FileSignature[] = [
  { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: DOCX_MIME, ext: "docx", magic: [0x50, 0x4b, 0x03, 0x04] }, // PK (ZIP)
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF
  { mime: "image/gif", ext: "gif", magic: [0x47, 0x49, 0x46] }, // GIF
];

/** Allowed upload types by category */
export const ALLOWED_FILE_TYPES = {
  document: ["application/pdf", DOCX_MIME],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  cv: ["application/pdf", DOCX_MIME, "image/jpeg", "image/png", "image/webp"],
} as const;

/** Max file sizes by category */
export const MAX_FILE_SIZES = {
  document: 10 * 1024 * 1024, // 10MB
  image: 5 * 1024 * 1024,     // 5MB
  cv: 10 * 1024 * 1024,       // 10MB
} as const;

/**
 * Validate file magic bytes match the claimed MIME type.
 * Returns the detected MIME type or null if invalid/unrecognized.
 */
export function validateMagicBytes(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 16));

  for (const sig of FILE_SIGNATURES) {
    if (sig.magic.every((byte, i) => bytes[i] === byte)) {
      return sig.mime;
    }
  }

  return null;
}

/**
 * Full file validation: checks size, claimed MIME, and magic bytes.
 * Returns an error message string or null if valid.
 */
export function validateUploadedFile(
  file: File,
  category: keyof typeof ALLOWED_FILE_TYPES,
  buffer: ArrayBuffer
): string | null {
  // Size check
  const maxSize = MAX_FILE_SIZES[category] ?? MAX_FILE_SIZES.document;
  if (file.size > maxSize) {
    return `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`;
  }

  if (file.size === 0) {
    return "File is empty.";
  }

  // MIME whitelist check
  const allowedMimes = ALLOWED_FILE_TYPES[category];
  if (!(allowedMimes as readonly string[]).includes(file.type)) {
    return `File type "${file.type}" is not allowed. Accepted: ${allowedMimes.join(", ")}`;
  }

  if (file.type === DOCX_MIME && !hasDocxStructure(buffer)) {
    return "Invalid DOCX structure. Please upload a valid .docx file.";
  }

  // Magic bytes check
  const detectedMime = validateMagicBytes(buffer);
  if (!detectedMime) {
    return "File content does not match any allowed file type.";
  }

  // Verify claimed MIME matches detected MIME
  if (detectedMime !== file.type) {
    return `File content mismatch: claimed "${file.type}" but detected "${detectedMime}".`;
  }

  return null;
}
