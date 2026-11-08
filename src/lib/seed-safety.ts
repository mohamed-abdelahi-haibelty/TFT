export function assertSafeSeedTarget(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.APP_ENV === "production") {
    throw new Error("Refusing to seed a production environment.");
  }
  if (env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error("Seeding deletes catalog and order data. Set ALLOW_DESTRUCTIVE_SEED=true only for a disposable database.");
  }
}
