import * as Sentry from "@sentry/nextjs";
import type { ErrorCode } from "./errors";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown> & { code?: ErrorCode };

// Taxonomy errors are expected outcomes, not bugs — only unlisted (INTERNAL)
// codes represent something unexpected enough to page on, so only those reach Sentry.
const EXPECTED_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
]);

function write(level: LogLevel, message: string, context?: LogContext, cause?: unknown) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  method(JSON.stringify(entry));

  if (level === "error" && !(context?.code && EXPECTED_ERROR_CODES.has(context.code))) {
    // Passing the real Error is what makes Sentry useful: it carries the stack
    // from where the failure actually happened. Fabricating `new Error(message)`
    // here instead put every event on this line, so Sentry grouped unrelated
    // failures together by message string. Callers that genuinely have no Error
    // object (a failed invariant, a bad upstream response) still fall back to one.
    Sentry.captureException(cause instanceof Error ? cause : new Error(message), {
      extra: context,
    });
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  /**
   * `cause` is the caught error itself, not a copy of its message. Pass it
   * wherever one exists — it is the difference between a usable stack trace
   * and a message string.
   */
  error: (message: string, context?: LogContext, cause?: unknown) =>
    write("error", message, context, cause),
};
