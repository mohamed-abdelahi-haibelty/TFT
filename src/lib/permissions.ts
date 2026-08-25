/**
 * The system's permission vocabulary.
 *
 * `role` stays a two-value enum (`admin` / `staff`): admin is the shop owner
 * and always holds every permission, implicitly and unrevocably. Permissions
 * describe what a *staff* account has been granted, one key per action the
 * owner would think of as a separate act of trust — which is why prices,
 * cancellations, POS voids and revenue are split out of the areas they live
 * in rather than riding along with them (PRODUCT.md: "staff cannot touch
 * products, prices, users, or the revenue dashboard" was the original rule;
 * these keys are that rule made adjustable).
 *
 * Pure module, no Next.js or DB imports — the checkbox editor, the sidebar,
 * the service gates and the tests all read the same source.
 */

export const PERMISSIONS = [
  "catalog.view",
  "catalog.manage",
  "catalog.pricing",
  "promotions.manage",
  "orders.view",
  "orders.manage",
  "orders.cancel",
  "pos.use",
  "pos.void",
  "inventory.view",
  "inventory.adjust",
  "labels.print",
  "dashboard.view",
  "users.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/**
 * Never grantable to staff, by construction rather than by policy: managing
 * accounts is how permissions are handed out, and the shop's own identity
 * sits with the owner. A staff account cannot reach these two keys, so no
 * staff account can widen its own access or anyone else's.
 */
export const ADMIN_ONLY_PERMISSIONS = ["users.manage", "settings.manage"] as const satisfies readonly Permission[];

const ADMIN_ONLY_SET: ReadonlySet<Permission> = new Set(ADMIN_ONLY_PERMISSIONS);

export function isGrantable(permission: Permission): boolean {
  return !ADMIN_ONLY_SET.has(permission);
}

export const GRANTABLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(isGrantable);

/**
 * What each permission cannot work without. Granting a dependent key grants
 * its prerequisites too (`expandPermissions`), because the alternative is an
 * account that can open an order detail page it is not allowed to list, or
 * ring up a product at the register it cannot otherwise look up. The owner
 * ticks one box and gets a coherent account; the editor shows the implied
 * boxes as already ticked.
 */
export const PERMISSION_REQUIRES: Readonly<Record<Permission, readonly Permission[]>> = {
  "catalog.view": [],
  "catalog.manage": ["catalog.view"],
  "catalog.pricing": ["catalog.manage"],
  "promotions.manage": ["catalog.view"],
  "orders.view": [],
  "orders.manage": ["orders.view"],
  "orders.cancel": ["orders.manage"],
  "pos.use": ["catalog.view"],
  "pos.void": ["pos.use", "orders.view"],
  "inventory.view": [],
  "inventory.adjust": ["inventory.view"],
  "labels.print": ["catalog.view"],
  "dashboard.view": ["orders.view"],
  "users.manage": [],
  "settings.manage": [],
};

/** Grouping and order for the editor and for the sidebar's own section order. */
export const PERMISSION_GROUPS = [
  { key: "orders", permissions: ["orders.view", "orders.manage", "orders.cancel"] },
  { key: "pos", permissions: ["pos.use", "pos.void"] },
  { key: "inventory", permissions: ["inventory.view", "inventory.adjust"] },
  { key: "catalog", permissions: ["catalog.view", "catalog.manage", "catalog.pricing"] },
  { key: "promotions", permissions: ["promotions.manage"] },
  { key: "labels", permissions: ["labels.print"] },
  { key: "dashboard", permissions: ["dashboard.view"] },
] as const satisfies readonly { key: string; permissions: readonly Permission[] }[];

export type PermissionGroupKey = (typeof PERMISSION_GROUPS)[number]["key"];

/**
 * Admin sidebar sections and the permission each one needs, in nav order.
 * The sidebar renders from this, and so does the post-login landing choice —
 * a staff account lands on the first section it can actually open, so the
 * two can never disagree about what is reachable.
 */
export const ADMIN_SECTIONS = [
  { href: "/admin", permission: "dashboard.view" },
  { href: "/admin/orders", permission: "orders.view" },
  { href: "/admin/pos", permission: "pos.use" },
  { href: "/admin/inventory", permission: "inventory.view" },
  { href: "/admin/categories", permission: "catalog.view" },
  { href: "/admin/products", permission: "catalog.view" },
  { href: "/admin/bundles", permission: "catalog.view" },
  { href: "/admin/promotions", permission: "promotions.manage" },
  { href: "/admin/labels/sheet", permission: "labels.print" },
  { href: "/admin/users", permission: "users.manage" },
  { href: "/admin/settings", permission: "settings.manage" },
] as const satisfies readonly { href: string; permission: Permission }[];

/** Drops anything that is not a current permission key — a column read back
 * after a key is renamed or retired yields stale strings, and a stale string
 * must never widen or narrow a gate by accident. */
export function parsePermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<Permission>();
  for (const value of raw) {
    if (typeof value === "string" && PERMISSION_SET.has(value)) seen.add(value as Permission);
  }
  return PERMISSIONS.filter((permission) => seen.has(permission));
}

/** Closes a granted set over `PERMISSION_REQUIRES`, returned in catalog order. */
export function expandPermissions(granted: readonly Permission[]): Permission[] {
  const resolved = new Set<Permission>();

  const add = (permission: Permission) => {
    if (resolved.has(permission)) return;
    resolved.add(permission);
    for (const required of PERMISSION_REQUIRES[permission]) add(required);
  };

  for (const permission of granted) add(permission);

  return PERMISSIONS.filter((permission) => resolved.has(permission));
}

/** The grantable subset, expanded — what actually gets stored on a staff row. */
export function normalizeGrantedPermissions(granted: readonly Permission[]): Permission[] {
  return expandPermissions(granted.filter(isGrantable)).filter(isGrantable);
}

/** Which already-granted permissions would break if `permission` were revoked. */
export function dependentsOf(permission: Permission): Permission[] {
  return PERMISSIONS.filter((candidate) => PERMISSION_REQUIRES[candidate].includes(permission));
}

export type PermissionHolder = {
  role: "admin" | "staff";
  permissions: readonly Permission[];
};

/** The one question every gate asks. Admin is never consulted against the list. */
export function hasPermission(holder: PermissionHolder, permission: Permission): boolean {
  if (holder.role === "admin") return true;
  return holder.permissions.includes(permission);
}

export function hasAnyPermission(holder: PermissionHolder, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(holder, permission));
}

/** First admin section this holder can open, or `null` when it can open none. */
export function firstAllowedSection(holder: PermissionHolder): string | null {
  return ADMIN_SECTIONS.find((section) => hasPermission(holder, section.permission))?.href ?? null;
}
