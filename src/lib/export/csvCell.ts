/**
 * One server-side CSV cell. A leading = + - @ tab or CR makes Excel/Sheets
 * evaluate the cell as a formula, so those get a leading apostrophe — the same
 * rule the client exporter applies in `sanitizeSpreadsheetCell`.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
