import { describe, expect, it } from "vitest";
import {
  addCartItem,
  type CartItem,
  cartCount,
  cartItemKey,
  cartItemName,
  cartSubtotal,
  removeCartItem,
  updateCartItemQty,
} from "@/src/lib/cart";

function product(overrides: Partial<CartItem> = {}): Omit<CartItem, "key"> {
  return {
    kind: "product",
    productId: "prod-1",
    slug: "cahier",
    nameAr: "دفتر",
    nameFr: "Cahier",
    image: null,
    unitPrice: 500,
    qty: 1,
    ...overrides,
  };
}

describe("cartItemName", () => {
  it("resolves each locale from the line's own snapshot", () => {
    const line = { ...product(), key: "product:prod-1" };
    expect(cartItemName(line, "ar")).toBe("دفتر");
    expect(cartItemName(line, "fr")).toBe("Cahier");
  });

  it("falls back to a pre-bilingual cart's single frozen name", () => {
    const legacy = { ...product({ nameAr: "", nameFr: "", name: "Cahier Seyès" }), key: "product:prod-1" };
    expect(cartItemName(legacy, "ar")).toBe("Cahier Seyès");
    expect(cartItemName(legacy, "fr")).toBe("Cahier Seyès");
  });
});

describe("cartItemKey", () => {
  it("keys a bare product by productId alone", () => {
    expect(cartItemKey({ kind: "product", productId: "p1" })).toBe("product:p1");
  });

  it("keys a product variant separately from its bare product", () => {
    expect(cartItemKey({ kind: "product", productId: "p1", variantId: "v1" })).toBe("product:p1:v1");
    expect(cartItemKey({ kind: "product", productId: "p1", variantId: "v1" })).not.toBe(
      cartItemKey({ kind: "product", productId: "p1" }),
    );
  });

  it("keys a bundle in its own namespace", () => {
    expect(cartItemKey({ kind: "bundle", bundleId: "b1" })).toBe("bundle:b1");
  });
});

describe("addCartItem", () => {
  it("appends a new line for an empty cart", () => {
    const result = addCartItem([], product());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "product:prod-1", qty: 1 });
  });

  it("merges quantities when the same line is added again", () => {
    const first = addCartItem([], product({ qty: 2 }));
    const second = addCartItem(first, product({ qty: 3 }));
    expect(second).toHaveLength(1);
    expect(second[0].qty).toBe(5);
  });

  it("refreshes the price snapshot on merge (latest add wins)", () => {
    const first = addCartItem([], product({ unitPrice: 500 }));
    const second = addCartItem(first, product({ unitPrice: 400 }));
    expect(second[0].unitPrice).toBe(400);
  });

  it("keeps two different variants of the same product as separate lines", () => {
    const withVariantA = addCartItem([], product({ variantId: "va" }));
    const withBoth = addCartItem(withVariantA, product({ variantId: "vb" }));
    expect(withBoth).toHaveLength(2);
  });

  it("keeps a bare product and a bundle sharing an unrelated id as separate lines", () => {
    const withProduct = addCartItem([], product({ productId: "shared-id" }));
    const withBundle = addCartItem(
      withProduct,
      product({ kind: "bundle", productId: undefined, bundleId: "shared-id", name: "Boîte" }),
    );
    expect(withBundle).toHaveLength(2);
  });
});

describe("cartCount", () => {
  it("sums quantities across every line", () => {
    const cart = addCartItem(addCartItem([], product({ qty: 2 })), product({ productId: "prod-2", qty: 3 }));
    expect(cartCount(cart)).toBe(5);
  });

  it("is zero for an empty cart", () => {
    expect(cartCount([])).toBe(0);
  });
});

describe("cartSubtotal", () => {
  it("sums unitPrice × qty across every line", () => {
    const cart = addCartItem(
      addCartItem([], product({ unitPrice: 500, qty: 2 })),
      product({ productId: "prod-2", unitPrice: 300, qty: 1 }),
    );
    expect(cartSubtotal(cart)).toBe(1300);
  });

  it("is zero for an empty cart", () => {
    expect(cartSubtotal([])).toBe(0);
  });
});

describe("removeCartItem", () => {
  it("removes only the matching line", () => {
    const cart = addCartItem(addCartItem([], product()), product({ productId: "prod-2" }));
    const result = removeCartItem(cart, "product:prod-1");
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe("prod-2");
  });

  it("is a no-op for a key that isn't in the cart", () => {
    const cart = addCartItem([], product());
    expect(removeCartItem(cart, "product:missing")).toHaveLength(1);
  });
});

describe("updateCartItemQty", () => {
  it("updates the qty of the matching line", () => {
    const cart = addCartItem([], product({ qty: 1 }));
    const result = updateCartItemQty(cart, "product:prod-1", 5);
    expect(result[0].qty).toBe(5);
  });

  it("removes the line when qty drops to zero or below", () => {
    const cart = addCartItem([], product());
    expect(updateCartItemQty(cart, "product:prod-1", 0)).toHaveLength(0);
    expect(updateCartItemQty(cart, "product:prod-1", -1)).toHaveLength(0);
  });
});
