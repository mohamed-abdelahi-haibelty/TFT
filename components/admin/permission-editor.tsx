"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  CreditCard,
  Package,
  ShoppingBag,
  Tag,
  Tags,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  GRANTABLE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_REQUIRES,
  type Permission,
  type PermissionGroupKey,
  expandPermissions,
  isGrantable,
} from "@/src/lib/permissions";
import { setStaffPermissionsAction } from "@/src/services/user-actions";

const GROUP_ICONS: Record<PermissionGroupKey, LucideIcon> = {
  orders: ShoppingBag,
  pos: CreditCard,
  inventory: Warehouse,
  catalog: Package,
  promotions: Tag,
  labels: Tags,
  dashboard: BarChart3,
};

function sameSet(a: readonly Permission[], b: readonly Permission[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** Everything that would stop working if `permission` were switched off. */
function withDependents(permissions: readonly Permission[], permission: Permission): Set<Permission> {
  const removed = new Set<Permission>([permission]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of GRANTABLE_PERMISSIONS) {
      if (removed.has(candidate)) continue;
      if (PERMISSION_REQUIRES[candidate].some((required) => removed.has(required))) {
        removed.add(candidate);
        grew = true;
      }
    }
  }
  return removed;
}

/**
 * The owner's one screen for deciding what a staff member may do.
 *
 * Two rules drive the interaction, and they are why this is a controlled
 * component rather than a plain checkbox form:
 *
 * - Ticking a box ticks everything it depends on. "Fix prices" without "edit
 *   the catalogue" is not a state the shop can be in, so the editor never
 *   lets it be reached instead of validating it away after the fact.
 * - A box that is only on because a ticked one needs it renders locked, with
 *   the reason named. Unticking the dependent releases it.
 *
 * `selected` is therefore always already closed over its prerequisites, and
 * the server closes the submitted list the same way
 * (`normalizeGrantedPermissions`), so a hand-made POST — or the locked
 * checkboxes, which being disabled post nothing — still stores the coherent
 * set rather than the literal one.
 */
export function PermissionEditor({
  userId,
  initialPermissions,
}: {
  userId: string;
  initialPermissions: Permission[];
}) {
  const t = useTranslations("admin.permissions");
  const { toast } = useToast();
  const fieldId = useId();

  const [state, formAction, isPending] = useActionState(
    setStaffPermissionsAction.bind(null, userId),
    null,
  );

  // What the server currently holds. The action result is the newer truth
  // once a save lands, so this is derived rather than synced.
  const saved = state?.ok ? state.data.permissions : initialPermissions;

  const [selected, setSelected] = useState<Permission[]>(initialPermissions);

  // Snap the boxes to what the server actually stored after a save — it may
  // differ from what was ticked, since the service closes the set over its
  // prerequisites. Adjusted during render rather than in an effect, so there
  // is no flash of the pre-save selection.
  const [appliedState, setAppliedState] = useState(state);
  if (appliedState !== state) {
    setAppliedState(state);
    if (state?.ok) setSelected(state.data.permissions);
  }

  const announced = useRef(state);
  useEffect(() => {
    if (announced.current === state || !state) return;
    announced.current = state;
    toast(state.ok ? t("saved") : state.error.message, state.ok ? "success" : "error");
  }, [state, t, toast]);

  /**
   * For each permission that is on, the *other* ticked permission that
   * requires it — the one the lock note names, so the owner reads "included
   * with Fix prices" rather than meeting a disabled box with no explanation.
   */
  const lockedBy = useMemo(() => {
    const map = new Map<Permission, Permission>();
    for (const permission of selected) {
      for (const required of expandPermissions([permission])) {
        if (required !== permission && !map.has(required)) map.set(required, permission);
      }
    }
    return map;
  }, [selected]);

  const isDirty = !sameSet(selected, saved);

  function toggle(permission: Permission, next: boolean) {
    setSelected((current) => {
      if (next) return expandPermissions([...current, permission]).filter(isGrantable);
      const removed = withDependents(current, permission);
      return current.filter((value) => !removed.has(value));
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {PERMISSION_GROUPS.map((group) => {
        const GroupIcon = GROUP_ICONS[group.key];

        return (
          <fieldset key={group.key} className="rounded-2xl border border-border px-3 py-4 sm:px-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-ink">
              <GroupIcon className="size-4 text-ink-soft" aria-hidden="true" />
              {t(`groups.${group.key}`)}
            </legend>

            <div className="mt-1 flex flex-col">
              {group.permissions.map((permission) => {
                const checked = selected.includes(permission);
                const lock = checked ? lockedBy.get(permission) : undefined;
                const requires = PERMISSION_REQUIRES[permission].filter(isGrantable);
                const nameId = `${fieldId}-${permission}-name`;
                const descId = `${fieldId}-${permission}-desc`;

                return (
                  <label
                    key={permission}
                    className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-paper has-[:disabled]:cursor-default"
                  >
                    <input
                      type="checkbox"
                      name="permission"
                      value={permission}
                      checked={checked}
                      disabled={!!lock}
                      onChange={(event) => toggle(permission, event.target.checked)}
                      aria-labelledby={nameId}
                      aria-describedby={descId}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:border-ink peer-focus-visible:ring-3 peer-focus-visible:ring-ink/30 ${
                        checked
                          ? lock
                            ? "border-ink-soft bg-ink-soft text-paper"
                            : "border-ink bg-ink text-paper"
                          : "border-border bg-background text-transparent group-hover:border-ink-soft"
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span id={nameId} className="block text-sm font-medium text-ink">
                        {t(`items.${permission}.name`)}
                      </span>
                      <span id={descId} className="mt-0.5 block text-xs leading-5 text-ink-soft">
                        {t(`items.${permission}.description`)}
                      </span>
                      {lock ? (
                        <span className="mt-2 inline-flex items-center rounded-xs border border-border px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                          {t("includedWith", { permission: t(`items.${lock}.name`) })}
                        </span>
                      ) : !checked && requires.length ? (
                        <span className="mt-1.5 block text-xs text-ink-soft">
                          {t("requiresNote", { permission: t(`items.${requires[0]}.name`) })}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {/*
        Sticky action bar rather than a button at the end of a long scroll:
        the owner works this on a tablet, seven groups run past one screen,
        and the save has to stay under the thumb. Solid ground, no
        backdrop-filter — Admin/POS is flat and opaque everywhere else.
      */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <p className="text-sm" aria-live="polite">
          {isDirty ? (
            <span className="font-semibold text-ink">{t("unsaved")}</span>
          ) : (
            <span className="text-ink-soft">{t("grantedCount", { count: saved.length })}</span>
          )}
        </p>

        <div className="flex items-center gap-2">
          {selected.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xs px-4 text-sm"
              onClick={() => setSelected([])}
            >
              {t("clearAll")}
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={isPending || !isDirty}
            className="h-11 rounded-xs bg-ink px-5 text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:opacity-70"
          >
            {isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      <p className="text-xs leading-5 text-ink-soft">{t("adminNote")}</p>
    </form>
  );
}
