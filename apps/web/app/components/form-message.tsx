export function FormMessage({
  message,
  success = false,
}: {
  message: string | undefined;
  success?: boolean | undefined;
}) {
  if (!message) return null;
  return (
    <p className={success ? 'form-message form-message--success' : 'form-message'} role="status">
      {message}
    </p>
  );
}
