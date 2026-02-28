interface FieldErrorProps {
  /** The error message to display. Renders nothing when undefined or empty. */
  message: string | undefined;
  /** Optional id for aria-describedby linkage on the associated input. */
  id?: string;
}

/**
 * Inline field-level error message displayed beneath a form input.
 * Renders nothing when message is falsy.
 */
export function FieldError({ message, id }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-400">
      {message}
    </p>
  );
}
