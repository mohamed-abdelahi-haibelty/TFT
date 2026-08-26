/**
 * English day names, in `schema.org`'s `dayOfWeek` vocabulary.
 *
 * This is a leaf module on purpose: both a client component (the admin
 * settings form) and a server one (the JSON-LD builders) need the list, and
 * importing it from `src/services/settings.ts` would drag the database client
 * and `env` into the browser bundle.
 *
 * The stored value is always English — only the *labels* are translated.
 */
export const SCHEMA_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type SchemaDay = (typeof SCHEMA_DAYS)[number];
