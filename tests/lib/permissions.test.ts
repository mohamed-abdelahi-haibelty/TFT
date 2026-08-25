import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_PERMISSIONS,
  ADMIN_SECTIONS,
  GRANTABLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_REQUIRES,
  type Permission,
  dependentsOf,
  expandPermissions,
  firstAllowedSection,
  hasPermission,
  normalizeGrantedPermissions,
  parsePermissions,
} from "@/src/lib/permissions";

const admin = { role: "admin" as const, permissions: [] as Permission[] };
const staff = (permissions: Permission[]) => ({ role: "staff" as const, permissions });

describe("permission catalog integrity", () => {
  it("gives every permission a group, except the two admin-only keys", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions as readonly Permission[]);

    expect([...grouped].sort()).toEqual([...GRANTABLE_PERMISSIONS].sort());
    expect([...ADMIN_ONLY_PERMISSIONS].sort()).toEqual(
      PERMISSIONS.filter((permission) => !grouped.includes(permission)).sort(),
    );
  });

  it("never lists a prerequisite that is not itself a permission", () => {
    for (const [permission, requires] of Object.entries(PERMISSION_REQUIRES)) {
      for (const required of requires) {
        expect(PERMISSIONS, `${permission} requires ${required}`).toContain(required);
      }
    }
  });

  it("has no dependency cycles", () => {
    for (const permission of PERMISSIONS) {
      expect(expandPermissions([permission])).toContain(permission);
    }
  });

  it("names a section permission that exists", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(PERMISSIONS).toContain(section.permission);
    }
  });
});

describe("expandPermissions", () => {
  it("pulls in prerequisites transitively", () => {
    expect(expandPermissions(["catalog.pricing"])).toEqual([
      "catalog.view",
      "catalog.manage",
      "catalog.pricing",
    ]);
  });

  it("returns catalog order, not input order", () => {
    expect(expandPermissions(["orders.cancel", "catalog.view"])).toEqual([
      "catalog.view",
      "orders.view",
      "orders.manage",
      "orders.cancel",
    ]);
  });

  it("is idempotent", () => {
    const once = expandPermissions(["pos.void"]);
    expect(expandPermissions(once)).toEqual(once);
  });
});

describe("normalizeGrantedPermissions", () => {
  it("drops the two keys that are never grantable, prerequisites included", () => {
    expect(normalizeGrantedPermissions(["users.manage", "settings.manage"])).toEqual([]);
  });

  it("closes a partial grant into a coherent one", () => {
    // The shape a hand-made POST would take: the dangerous key alone.
    expect(normalizeGrantedPermissions(["orders.cancel"])).toEqual([
      "orders.view",
      "orders.manage",
      "orders.cancel",
    ]);
  });

  it("keeps an already-coherent grant unchanged", () => {
    const granted: Permission[] = ["catalog.view", "promotions.manage"];
    expect(normalizeGrantedPermissions(granted)).toEqual(granted);
  });
});

describe("parsePermissions", () => {
  it("drops keys that are not in the catalog", () => {
    expect(parsePermissions(["orders.view", "orders.destroy", 42, null])).toEqual(["orders.view"]);
  });

  it("de-duplicates and returns catalog order", () => {
    expect(parsePermissions(["orders.view", "catalog.view", "orders.view"])).toEqual([
      "catalog.view",
      "orders.view",
    ]);
  });

  it("treats a non-array as no permissions", () => {
    expect(parsePermissions(null)).toEqual([]);
    expect(parsePermissions("catalog.view")).toEqual([]);
  });
});

describe("hasPermission", () => {
  it("answers true for admin on every key, including the ungrantable ones", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(admin, permission)).toBe(true);
    }
  });

  it("answers only on what staff was granted", () => {
    const operator = staff(["orders.view", "orders.manage"]);

    expect(hasPermission(operator, "orders.manage")).toBe(true);
    expect(hasPermission(operator, "orders.cancel")).toBe(false);
    expect(hasPermission(operator, "users.manage")).toBe(false);
  });

  it("cannot be satisfied by a granted prerequisite", () => {
    // Holding `catalog.manage` must never imply `catalog.pricing`: the
    // dependency runs the other way, and a permissive `hasPermission` here
    // would hand every catalogue editor the price fields.
    expect(hasPermission(staff(["catalog.view", "catalog.manage"]), "catalog.pricing")).toBe(false);
  });
});

describe("firstAllowedSection", () => {
  it("sends admin to the dashboard", () => {
    expect(firstAllowedSection(admin)).toBe("/admin");
  });

  it("sends a staff member to their first granted section in nav order", () => {
    expect(firstAllowedSection(staff(["catalog.view", "orders.view"]))).toBe("/admin/orders");
    expect(firstAllowedSection(staff(["catalog.view"]))).toBe("/admin/categories");
  });

  it("returns null for an account with nothing granted", () => {
    expect(firstAllowedSection(staff([]))).toBeNull();
  });
});

describe("dependentsOf", () => {
  it("names what breaks when a permission is revoked", () => {
    expect(dependentsOf("orders.view").sort()).toEqual(
      ["dashboard.view", "orders.manage", "pos.void"].sort(),
    );
    expect(dependentsOf("dashboard.view")).toEqual([]);
  });
});
