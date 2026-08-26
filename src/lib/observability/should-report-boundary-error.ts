/**
 * Whether an error caught by a React error boundary still needs sending to
 * Sentry, or has already been reported by something better placed to do it.
 *
 * A `digest` means React caught this while rendering on the server, where
 * `onRequestError` (instrumentation.ts) has already captured it with its real
 * server stack. Reporting it again from the browser spends a second event out
 * of Sentry's 5,000-a-month free tier on a strictly worse copy: the server
 * frames are gone by the time the error reaches the client, so the duplicate
 * carries nothing but the boundary's own stack.
 *
 * No digest means a genuine client-side failure — a hydration mismatch, an
 * effect, an event handler — that nothing on the server ever saw. Those are the
 * ones the boundary is the only possible reporter for.
 */
export function shouldReportBoundaryError(error: Error & { digest?: string }): boolean {
  return !error.digest;
}
