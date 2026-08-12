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

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  method(JSON.stringify(entry));

  if (level === "error" && !(context?.code && EXPECTED_ERROR_CODES.has(context.code))) {
    Sentry.captureException(new Error(message), { extra: context });
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
