import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/src/lib/db-errors";

/**
 * The shape Drizzle actually throws. It does not surface the driver's error
 * directly: `DrizzleQueryError` wraps the `NeonDbError` as `cause`, and the
 * SQLSTATE code and constraint name live only on the inner one.
 *
 * Reproduced from a real failure:
 *
 *   Error: Failed query: insert into "orders" (…)
 *   Caused by: NeonDbError: duplicate key value violates unique
 *              constraint "orders_idempotency_key_unique"
 */
function drizzleWrapped(constraint: string): Error {
  const driverError = Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    severity: "ERROR",
    code: "23505",
    constraint,
    schema: "public",
    table: "orders",
    routine: "_bt_check_unique",
  });

  return Object.assign(new Error("Failed query: insert into \"orders\" (…)"), { cause: driverError });
}

/** What a driver error looks like if it ever reaches a caller unwrapped. */
function bareDriverError(constraint: string): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint,
  });
}

describe("isUniqueViolation", () => {
  it("sees through Drizzle's wrapper to the driver's code and constraint", () => {
    // The regression this exists for: checking only the top-level object
    // matched nothing, which silently disabled every collision retry and
    // CONFLICT mapping in the codebase.
    expect(isUniqueViolation(drizzleWrapped("orders_idempotency_key_unique"), "orders_idempotency_key_unique")).toBe(
      true,
    );
    expect(isUniqueViolation(drizzleWrapped("products_sku_unique"), "products_sku_unique")).toBe(true);
  });

  it("still matches an unwrapped driver error", () => {
    expect(isUniqueViolation(bareDriverError("users_email_unique"), "users_email_unique")).toBe(true);
  });

  it("walks more than one level of cause", () => {
    const nested = Object.assign(new Error("outer"), {
      cause: Object.assign(new Error("middle"), { cause: bareDriverError("bundles_slug_unique") }),
    });
    expect(isUniqueViolation(nested, "bundles_slug_unique")).toBe(true);
  });

  it("does not match a different constraint on the same table", () => {
    // `insertWithUniqueOrderCode` must retry on the code collision and rethrow
    // an idempotency-key collision for its caller to interpret — conflating
    // the two would retry forever on the wrong error.
    expect(isUniqueViolation(drizzleWrapped("orders_code_unique"), "orders_idempotency_key_unique")).toBe(false);
    expect(isUniqueViolation(drizzleWrapped("orders_idempotency_key_unique"), "orders_code_unique")).toBe(false);
  });

  it("does not match a different SQLSTATE", () => {
    const foreignKeyViolation = Object.assign(new Error("fk"), {
      code: "23503",
      constraint: "orders_code_unique",
    });
    expect(isUniqueViolation(foreignKeyViolation, "orders_code_unique")).toBe(false);
  });

  it("returns false for anything that is not an error object", () => {
    expect(isUniqueViolation(null, "products_sku_unique")).toBe(false);
    expect(isUniqueViolation(undefined, "products_sku_unique")).toBe(false);
    expect(isUniqueViolation("23505", "products_sku_unique")).toBe(false);
    expect(isUniqueViolation(new Error("plain"), "products_sku_unique")).toBe(false);
  });

  it("terminates on a self-referencing cause instead of spinning", () => {
    const looped: { cause?: unknown } = {};
    looped.cause = looped;
    expect(isUniqueViolation(looped, "products_sku_unique")).toBe(false);
  });
});
