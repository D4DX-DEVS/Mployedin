/** An employer picker option, plus what tells it apart from a same-named one. */
export interface EmployerLabelSource {
  value: string;
  label: string;
  /** The account's email. */
  hint?: string;
}

export interface EmployerOptionLabel {
  value: string;
  label: string;
}

const nameKey = (label: string) => label.trim().toLowerCase();

/**
 * Company names are not unique: separate employer accounts can register the
 * same one, and a picker listing them by name alone shows identical rows the
 * user cannot choose between. A name that repeats gets its account email
 * appended; a unique name stays as it is.
 */
export function disambiguateEmployerLabels(options: readonly EmployerLabelSource[]): EmployerOptionLabel[] {
  const counts = new Map<string, number>();
  for (const { label } of options) counts.set(nameKey(label), (counts.get(nameKey(label)) ?? 0) + 1);
  return options.map(({ value, label, hint }) => ({
    value,
    label: hint && (counts.get(nameKey(label)) ?? 0) > 1 ? `${label} · ${hint}` : label,
  }));
}
