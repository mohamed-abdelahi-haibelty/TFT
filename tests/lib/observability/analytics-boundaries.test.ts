import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SOURCE_DIRS = ["app", "components", "src"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  const found: string[] = [];

  for (const entry of readdirSync(absolute)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(path.join(dir, entry)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      found.push(path.join(dir, entry));
    }
  }

  return found;
}

const ALL_SOURCES = SOURCE_DIRS.flatMap(sourceFiles);

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

/**
 * The one rule that protects the Neon Free budget from the analytics layer.
 *
 * `src/lib/analytics.ts` reaches `after()`, and `analytics-identity.ts` reaches
 * `cookies()`. Both are request-time APIs. Called from a module that also
 * declares `use cache`, they either run at revalidation time — reporting one
 * event per fifteen minutes regardless of traffic — or force the route dynamic,
 * which wakes the database once per visitor and opens a five-minute compute
 * window each time. That is exactly the cost the task-17 caching pass was
 * written to remove, and a single stray import puts it back.
 */
describe("server analytics never enters a cached scope", () => {
  const SERVER_ANALYTICS = ["@/src/lib/analytics", "@/src/lib/analytics-identity"];

  it("no module containing a `use cache` directive imports the server analytics helpers", () => {
    const offenders = ALL_SOURCES.filter((file) => {
      const contents = read(file);
      if (!/["']use cache["']/.test(contents)) return false;
      return SERVER_ANALYTICS.some((mod) => contents.includes(`from "${mod}"`));
    });

    expect(offenders).toEqual([]);
  });

  it("the cached storefront service does not import them", () => {
    const storefront = read("src/services/storefront.ts");
    for (const mod of SERVER_ANALYTICS) {
      expect(storefront).not.toContain(`from "${mod}"`);
    }
  });
});

/**
 * posthog-js is ~50 KB that no storefront page may pay for up front. The
 * dynamic `import()` in analytics-client.ts is the only thing keeping it in its
 * own chunk; a static import anywhere would fold it into the initial payload
 * and undo the LCP protection the whole design is built around.
 */
describe("posthog-js stays out of the initial bundle", () => {
  it("is only ever reached through a dynamic import", () => {
    const offenders = ALL_SOURCES.filter((file) => {
      const contents = read(file);
      // A type-only import is erased at compile time and costs nothing.
      return /^import\s+(?!type\s)[^;]*from\s+["']posthog-js["']/m.test(contents);
    });

    expect(offenders).toEqual([]);
  });

  it("analytics-client.ts loads it dynamically", () => {
    expect(read("src/lib/analytics-client.ts")).toContain('import("posthog-js")');
  });
});
