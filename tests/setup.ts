import { config } from "dotenv";

config({ path: ".env.test", quiet: true });

// Integration tests write to the database. Never silently fall back to .env.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL in .env.test to a disposable Neon database before running integration tests.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
