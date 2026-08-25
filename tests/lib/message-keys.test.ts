import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import ar from "@/messages/ar.json";
import fr from "@/messages/fr.json";

/**
 * Two different questions about the message catalogues.
 *
 * Parity (`ar` against `fr`) was already implicitly relied on, and it is worth
 * asserting — but it cannot see a key the *code* needs and neither file has.
 * `app/api/cloudinary/delete/route.ts` returned `t("invalidImageInput")` from a
 * namespace where no such key existed in either locale: next-intl throws on it
 * in development and renders the raw dotted path in production, so the one
 * validation error that endpoint can produce was never a sentence. Parity was
 * perfect the whole time.
 *
 * So this file asks both: are the two catalogues the same shape, and does every
 * key the source actually references resolve?
 */

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

function resolves(tree: MessageTree, path: string): boolean {
  let current: string | MessageTree = tree;
  for (const part of path.split(".")) {
    if (typeof current === "string" || !(part in current)) return false;
    current = current[part];
  }
  return typeof current === "string";
}

describe("message catalogues — parity", () => {
  it("defines exactly the same keys in both locales", () => {
    const arKeys = flatten(ar as MessageTree).sort();
    const frKeys = flatten(fr as MessageTree).sort();
    expect(arKeys).toEqual(frKeys);
  });

  it("has no empty strings standing in for a missing translation", () => {
    for (const [locale, tree] of [["ar", ar], ["fr", fr]] as const) {
      for (const key of flatten(tree as MessageTree)) {
        const value = key.split(".").reduce<unknown>((cur, part) => (cur as MessageTree)[part], tree);
        expect(typeof value === "string" && value.trim().length > 0, `${locale}: ${key} is blank`).toBe(true);
      }
    }
  });
});

// --- referenced-key resolution -------------------------------------------

const NS_ARG = String.raw`\(\s*(?:"([^"]*)"|\{[^{}]*namespace:\s*"([^"]*)"[^{}]*\}|)\s*\)`;
const SIMPLE_BINDING = new RegExp(
  String.raw`(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*${NS_ARG}`,
  "g",
);
const DESTRUCTURED_BINDING = new RegExp(
  String.raw`(?:const|let)\s+\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)`,
  "g",
);
const TRANSLATOR_CALL = new RegExp(String.raw`(?:useTranslations|getTranslations)\s*${NS_ARG}`);
const TRANSLATOR_PARAM = /([A-Za-z_$][\w$]*)\s*:\s*(?:Awaited<)?ReturnType<typeof\s+(?:use|get)Translations>/g;

/** Splits a bracketed argument list on its top-level commas. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth--;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

type Binding = { name: string; namespace: string; at: number };

function bindingsIn(source: string): Binding[] {
  const bindings: Binding[] = [];

  for (const match of source.matchAll(SIMPLE_BINDING)) {
    bindings.push({ name: match[1], namespace: match[2] ?? match[3] ?? "", at: match.index });
  }

  // `const [t, categories] = await Promise.all([getTranslations({…}), …])`
  for (const match of source.matchAll(DESTRUCTURED_BINDING)) {
    const names = splitTopLevel(match[1]).map((name) => name.trim());
    const items = splitTopLevel(match[2]);
    names.forEach((name, index) => {
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) return;
      const inner = items[index]?.match(TRANSLATOR_CALL);
      if (!inner) return;
      bindings.push({ name, namespace: inner[1] ?? inner[2] ?? "", at: match.index });
    });
  }

  return bindings.sort((a, b) => a.at - b.at);
}

function sourceFiles(): string[] {
  return execSync(String.raw`find app components src -type f \( -name '*.ts' -o -name '*.tsx' \)`, {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
}

describe("message catalogues — every referenced key resolves", () => {
  it("finds no literal key in the source that the catalogue lacks", () => {
    const missing: string[] = [];
    let checked = 0;

    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      const bindings = bindingsIn(source);
      if (bindings.length === 0) continue;

      // A translator taken as a function parameter carries whatever namespace
      // its *caller* used, which isn't knowable here — and it shadows any
      // same-named binding in the file, so skip that name entirely.
      const shadowed = new Set([...source.matchAll(TRANSLATOR_PARAM)].map((match) => match[1]));

      const names = new Set(bindings.map((binding) => binding.name).filter((name) => !shadowed.has(name)));

      for (const name of names) {
        // Each binding governs from its declaration to the next one of the
        // same name — enough for this codebase, which redeclares `t` per
        // function rather than shadowing mid-block.
        const calls = source.matchAll(new RegExp(String.raw`\b${name}\(\s*(?:"([^"]*)"|\`)`, "g"));

        for (const call of calls) {
          // A template literal is a computed key (`t(\`status.${x}\`)`) — the
          // enum it interpolates is checked by TypeScript, not here.
          if (call[1] === undefined) continue;

          const binding = bindings.filter((b) => b.name === name && b.at <= call.index).at(-1);
          if (!binding) continue;

          checked++;
          const path = binding.namespace ? `${binding.namespace}.${call[1]}` : call[1];
          if (!resolves(ar as MessageTree, path)) missing.push(`${file}: ${name}("${call[1]}") -> ${path}`);
        }
      }
    }

    // Guards the scanner itself: if a refactor breaks the binding patterns it
    // recognises, this drops toward zero and the test silently stops checking.
    expect(checked).toBeGreaterThan(500);
    expect(missing).toEqual([]);
  });
});
