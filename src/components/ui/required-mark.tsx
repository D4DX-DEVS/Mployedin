/**
 * The `*` after a required field's label. Hidden from screen readers: they
 * announce the field's own `required` / `aria-required` instead of "star"
 * (a button trigger such as DateTimePicker says it in its name).
 * Forms using it also show `common.requiredFieldsNote` so the mark is explained.
 */
export function RequiredMark() {
  return <span aria-hidden="true" className="text-destructive">*</span>;
}
