export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export const HTTP_STATUS_BY_ERROR_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

// `details` is optional and code-specific (e.g. order creation's CONFLICT
// carries the unavailable cart line keys) — every existing caller that
// never sets it is unaffected.
export type ServiceError = { code: ErrorCode; message: string; details?: unknown };

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
