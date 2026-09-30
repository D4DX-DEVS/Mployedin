interface FieldErrorProps {
  /** Referenced by the field's aria-describedby. */
  id: string;
  message?: string;
}

/** Inline message under one form field. Renders nothing when the field is valid. */
export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
