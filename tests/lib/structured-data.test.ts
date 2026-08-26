import { describe, expect, it } from "vitest";
import {
  BUSINESS_LEGAL_NAME,
  breadcrumbJsonLd,
  itemListJsonLd,
  productJsonLd,
  shopNodeId,
  storeJsonLd,
  webSiteJsonLd,
} from "@/src/lib/structured-data";
import { absoluteUrl, siteOrigin } from "@/src/lib/site";
import type { ShopSettings } from "@/src/services/settings";

const EMPTY_SETTINGS: ShopSettings = {
  whatsappNumber: null,
  addressAr: null,
  addressFr: null,
  mapsUrl: null,
  streetAr: null,
  streetFr: null,
  city: null,
  postalCode: null,
  country: null,
  latitude: null,
  longitude: null,
  opensAt: null,
  closesAt: null,
  closedDay: null,
  instagramUrl: null,
  facebookUrl: null,
};

const FULL_SETTINGS: ShopSettings = {
  ...EMPTY_SETTINGS,
  whatsappNumber: "22227139094",
  streetAr: "شارع المدينة",
  streetFr: "Rue de la ville",
  city: "Nouadhibou",
  country: "MR",
  latitude: 20.9412,
  longitude: -17.0347,
  opensAt: "09:00",
  closesAt: "20:00",
  closedDay: "Friday",
  instagramUrl: "https://instagram.com/tft",
  mapsUrl: "https://maps.app.goo.gl/x",
};

function store(settings: ShopSettings, locale = "fr") {
  return storeJsonLd({
    locale,
    name: BUSINESS_LEGAL_NAME,
    alternateName: "TFT",
    description: "desc",
    settings,
  }) as Record<string, unknown>;
}

describe("storeJsonLd", () => {
  it("omits every property the shop has not filled in", () => {
    const json = store(EMPTY_SETTINGS);
    expect(json.telephone).toBeUndefined();
    expect(json.geo).toBeUndefined();
    expect(json.openingHoursSpecification).toBeUndefined();
    expect(json.sameAs).toBeUndefined();
    expect(json.hasMap).toBeUndefined();
    // The type, id and currency stand regardless — they are what make the
    // record a shop rather than an empty node.
    expect(json["@type"]).toBe("Store");
    expect(json["@id"]).toBe(shopNodeId());
    expect(json.currenciesAccepted).toBe("MRU");
  });

  it("defaults the country even with nothing else set", () => {
    expect(store(EMPTY_SETTINGS).address).toEqual({ "@type": "PostalAddress", addressCountry: "MR" });
  });

  it("builds a full PostalAddress and GeoCoordinates once filled in", () => {
    const json = store(FULL_SETTINGS);
    expect(json.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Rue de la ville",
      addressLocality: "Nouadhibou",
      addressCountry: "MR",
    });
    expect(json.geo).toEqual({ "@type": "GeoCoordinates", latitude: 20.9412, longitude: -17.0347 });
    expect(json.telephone).toBe("+22227139094");
    expect(json.sameAs).toEqual(["https://instagram.com/tft"]);
    expect(json.hasMap).toBe("https://maps.app.goo.gl/x");
  });

  it("picks the street in the reader's language", () => {
    expect((store(FULL_SETTINGS, "ar").address as Record<string, unknown>).streetAddress).toBe("شارع المدينة");
  });

  it("falls back to the free-text address when the structured street is empty", () => {
    const json = store({ ...EMPTY_SETTINGS, addressFr: "Marché central" });
    expect((json.address as Record<string, unknown>).streetAddress).toBe("Marché central");
  });

  it("opens every day except the closing one", () => {
    const hours = store(FULL_SETTINGS).openingHoursSpecification as Record<string, unknown>;
    expect(hours.opens).toBe("09:00");
    expect(hours.closes).toBe("20:00");
    expect(hours.dayOfWeek).toHaveLength(6);
    expect(hours.dayOfWeek).not.toContain("https://schema.org/Friday");
    expect(hours.dayOfWeek).toContain("https://schema.org/Saturday");
  });

  it("emits no hours at all when only one end of the day is known", () => {
    expect(store({ ...FULL_SETTINGS, closesAt: null }).openingHoursSpecification).toBeUndefined();
  });
});

describe("webSiteJsonLd", () => {
  it("points the sitelinks search box at the real catalog search", () => {
    const json = webSiteJsonLd({ locale: "ar", name: "TFT", description: "d" });
    expect(json.potentialAction.target.urlTemplate).toBe(
      `${siteOrigin()}/ar/catalog?q={search_term_string}`,
    );
    expect(json.publisher).toEqual({ "@id": shopNodeId() });
  });
});

describe("productJsonLd", () => {
  const base = {
    name: "Cahier",
    url: absoluteUrl("fr", "/product/cahier"),
    price: 250,
    availability: "in-stock" as const,
  };

  it("prices in MRU and sells as the shop", () => {
    const offers = productJsonLd(base).offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe("MRU");
    expect(offers.price).toBe(250);
    expect(offers.availability).toBe("https://schema.org/InStock");
    expect(offers.itemCondition).toBe("https://schema.org/NewCondition");
    expect(offers.seller).toEqual({ "@id": shopNodeId() });
  });

  it("maps backorder to BackOrder rather than collapsing it into out-of-stock", () => {
    const offers = productJsonLd({ ...base, availability: "backorder" }).offers as Record<string, unknown>;
    expect(offers.availability).toBe("https://schema.org/BackOrder");
  });

  it("leaves priceValidUntil out when there is no promotion", () => {
    expect((productJsonLd(base).offers as Record<string, unknown>).priceValidUntil).toBeUndefined();
  });

  it("drops empty optionals rather than emitting null properties", () => {
    const json = productJsonLd({ ...base, images: [], description: undefined }) as Record<string, unknown>;
    expect(json.image).toBeUndefined();
    expect(json.description).toBeUndefined();
    expect(json.sku).toBeUndefined();
  });

  // No brand and no rating, deliberately — see the note in productJsonLd.
  it("asserts neither a brand nor a rating", () => {
    const json = productJsonLd({ ...base, sku: "SKU-1" }) as Record<string, unknown>;
    expect(json.brand).toBeUndefined();
    expect(json.aggregateRating).toBeUndefined();
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers from one and leaves the current page without a link", () => {
    const json = breadcrumbJsonLd([{ name: "Cahiers", url: "https://x/fr/catalog/cahiers" }, { name: "Cahier A5" }]);
    expect(json.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Cahiers", item: "https://x/fr/catalog/cahiers" },
      { "@type": "ListItem", position: 2, name: "Cahier A5" },
    ]);
  });
});

describe("itemListJsonLd", () => {
  it("counts and orders what the listing page rendered", () => {
    const json = itemListJsonLd({
      url: "https://x/fr/boxes",
      items: [
        { name: "A", url: "https://x/fr/boxes/a" },
        { name: "B", url: "https://x/fr/boxes/b" },
      ],
    });
    expect(json.numberOfItems).toBe(2);
    expect(json.itemListElement.map((item) => item.position)).toEqual([1, 2]);
  });
});
