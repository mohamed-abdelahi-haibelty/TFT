import { describe, expect, it } from "vitest";
import {
  isPurchasable,
  matchesSearchTerm,
  selectCatalogProducts,
  type FilterableCard,
} from "@/src/lib/catalog-filter";

/** Snapshot order is `created_at desc`, so these are "newest" to "oldest" top to bottom. */
function card(overrides: Partial<FilterableCard> & { nameFr: string }): FilterableCard {
  return {
    nameAr: "كراس",
    categorySlug: "cahiers",
    basePrice: 500,
    effectivePrice: 500,
    stockQty: 10,
    allowBackorder: false,
    ...overrides,
  };
}

const catalog: FilterableCard[] = [
  card({ nameFr: "Cahier Seyès", basePrice: 800, effectivePrice: 600, nameAr: "كراس سييس" }),
  card({ nameFr: "Stylo Bleu", categorySlug: "stylos", basePrice: 200, effectivePrice: 200, nameAr: "قلم أزرق" }),
  card({ nameFr: "Trousse 100%", categorySlug: "trousses", basePrice: 1500, effectivePrice: 1500, stockQty: 0 }),
  card({ nameFr: "Gomme", categorySlug: "stylos", basePrice: 100, effectivePrice: 100, stockQty: 0, allowBackorder: true }),
];

describe("matchesSearchTerm", () => {
  it("matches either locale's name, case-insensitively", () => {
    expect(matchesSearchTerm(catalog[0], "seyès")).toBe(true);
    expect(matchesSearchTerm(catalog[0], "CAHIER")).toBe(true);
    expect(matchesSearchTerm(catalog[0], "سييس")).toBe(true);
  });

  it("treats a LIKE wildcard as the literal character it looks like", () => {
    // The SQL path had to escape these; in memory there is nothing to escape.
    expect(matchesSearchTerm(catalog[2], "100%")).toBe(true);
    expect(matchesSearchTerm(catalog[2], "%")).toBe(true);
    expect(matchesSearchTerm(catalog[0], "_")).toBe(false);
  });

  it("does not fold accents, matching what ILIKE did", () => {
    expect(matchesSearchTerm(catalog[0], "seyes")).toBe(false);
  });
});

describe("isPurchasable", () => {
  it("is true with stock, or with none but backorder allowed", () => {
    expect(isPurchasable({ stockQty: 1, allowBackorder: false })).toBe(true);
    expect(isPurchasable({ stockQty: 0, allowBackorder: true })).toBe(true);
    expect(isPurchasable({ stockQty: 0, allowBackorder: false })).toBe(false);
  });
});

describe("selectCatalogProducts", () => {
  it("returns the snapshot untouched, in its own order, with no filters", () => {
    const result = selectCatalogProducts(catalog, {}, 100);
    expect(result.map((row) => row.nameFr)).toEqual(["Cahier Seyès", "Stylo Bleu", "Trousse 100%", "Gomme"]);
  });

  it("narrows by category", () => {
    const result = selectCatalogProducts(catalog, { categorySlug: "stylos" }, 100);
    expect(result.map((row) => row.nameFr)).toEqual(["Stylo Bleu", "Gomme"]);
  });

  it("filters price against the list price, not the promo price", () => {
    // Cahier is 800 base / 600 effective: a max of 700 must exclude it.
    const result = selectCatalogProducts(catalog, { maxPrice: 700 }, 100);
    expect(result.map((row) => row.nameFr)).toEqual(["Stylo Bleu", "Gomme"]);
    expect(selectCatalogProducts(catalog, { minPrice: 800 }, 100).map((row) => row.nameFr)).toEqual([
      "Cahier Seyès",
      "Trousse 100%",
    ]);
  });

  it("keeps backorder-enabled items when filtering to in-stock only", () => {
    const result = selectCatalogProducts(catalog, { inStockOnly: true }, 100);
    expect(result.map((row) => row.nameFr)).toEqual(["Cahier Seyès", "Stylo Bleu", "Gomme"]);
  });

  it("sorts by the price the customer would actually pay", () => {
    const ascending = selectCatalogProducts(catalog, { sort: "price-asc" }, 100);
    expect(ascending.map((row) => row.effectivePrice)).toEqual([100, 200, 600, 1500]);
    const descending = selectCatalogProducts(catalog, { sort: "price-desc" }, 100);
    expect(descending.map((row) => row.effectivePrice)).toEqual([1500, 600, 200, 100]);
  });

  it("combines every filter at once", () => {
    const result = selectCatalogProducts(
      catalog,
      { categorySlug: "stylos", search: "o", inStockOnly: true, sort: "price-asc" },
      100,
    );
    expect(result.map((row) => row.nameFr)).toEqual(["Gomme", "Stylo Bleu"]);
  });

  it("sorts the whole filtered set before capping it", () => {
    // The SQL version capped first, so "cheapest" only ranked the newest N.
    const result = selectCatalogProducts(catalog, { sort: "price-asc" }, 2);
    expect(result.map((row) => row.nameFr)).toEqual(["Gomme", "Stylo Bleu"]);
  });

  it("does not mutate the snapshot it was handed", () => {
    const before = catalog.map((row) => row.nameFr);
    selectCatalogProducts(catalog, { sort: "price-desc" }, 100);
    expect(catalog.map((row) => row.nameFr)).toEqual(before);
  });
});
