import { describe, expect, it } from "vitest";
import { deriveLimitingComponent, deriveMaxSellable } from "@/src/lib/bundle-availability";

describe("deriveMaxSellable", () => {
  it("returns the smallest floor(stock / qty) across a 3-item bundle", () => {
    const components = [
      { qty: 1, stock: 10, allowBackorder: false }, // 10 sellable
      { qty: 2, stock: 9, allowBackorder: false }, // floor(9/2) = 4 sellable — the binding constraint
      { qty: 1, stock: 20, allowBackorder: false }, // 20 sellable
    ];
    expect(deriveMaxSellable(components)).toBe(4);
  });

  it("re-derives correctly after a component's stock changes", () => {
    const components = [
      { qty: 1, stock: 10, allowBackorder: false },
      { qty: 2, stock: 9, allowBackorder: false },
      { qty: 1, stock: 20, allowBackorder: false },
    ];
    expect(deriveMaxSellable(components)).toBe(4);

    // The previously-binding component's stock drops further.
    const restocked = components.map((c, i) => (i === 1 ? { ...c, stock: 3 } : c));
    expect(deriveMaxSellable(restocked)).toBe(1); // floor(3/2) = 1, now the binding constraint

    // A different component becomes the binding constraint instead.
    const rebalanced = restocked.map((c, i) => (i === 1 ? { ...c, stock: 100 } : i === 0 ? { ...c, stock: 2 } : c));
    expect(deriveMaxSellable(rebalanced)).toBe(2);
  });

  it("excludes a backorder-eligible component from the limiting min", () => {
    const components = [
      { qty: 1, stock: 0, allowBackorder: true }, // out of stock but backorderable — never limits
      { qty: 3, stock: 10, allowBackorder: false }, // floor(10/3) = 3 — the real limit
    ];
    expect(deriveMaxSellable(components)).toBe(3);
  });

  it("returns null (unlimited) when every component allows backorder", () => {
    const components = [
      { qty: 1, stock: 0, allowBackorder: true },
      { qty: 5, stock: 0, allowBackorder: true },
    ];
    expect(deriveMaxSellable(components)).toBeNull();
  });

  it("returns 0 for a bundle with no items", () => {
    expect(deriveMaxSellable([])).toBe(0);
  });
});

describe("deriveLimitingComponent", () => {
  const names = (nameFr: string) => ({ nameAr: `عربي ${nameFr}`, nameFr });

  it("names the component whose floor(stock / qty) equals the max", () => {
    const components = [
      { qty: 1, stock: 10, allowBackorder: false, ...names("Cahier") },
      { qty: 2, stock: 9, allowBackorder: false, ...names("Stylo") },
      { qty: 1, stock: 20, allowBackorder: false, ...names("Gomme") },
    ];
    expect(deriveLimitingComponent(components)).toEqual(names("Stylo"));
  });

  it("skips backorder-eligible components when picking the limiter", () => {
    const components = [
      { qty: 1, stock: 0, allowBackorder: true, ...names("Règle") },
      { qty: 3, stock: 10, allowBackorder: false, ...names("Crayon") },
    ];
    expect(deriveLimitingComponent(components)).toEqual(names("Crayon"));
  });

  it("returns null when nothing limits the bundle", () => {
    const components = [
      { qty: 1, stock: 0, allowBackorder: true, ...names("Règle") },
      { qty: 5, stock: 0, allowBackorder: true, ...names("Crayon") },
    ];
    expect(deriveLimitingComponent(components)).toBeNull();
  });

  it("returns null for a bundle with no items", () => {
    expect(deriveLimitingComponent([])).toBeNull();
  });
});
