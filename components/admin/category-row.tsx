"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localized } from "@/src/lib/locale-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "@/src/i18n/navigation";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
} from "@/src/services/category-actions";

export function CategoryRow({
  category,
  allIds,
  index,
}: {
  category: { id: string; nameAr: string; nameFr: string; slug: string };
  allIds: string[];
  index: number;
}) {
  const t = useTranslations("admin.categories");
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const boundUpdate = updateCategoryAction.bind(null, category.id);
  const [updateState, updateFormAction, isUpdatePending] = useActionState(boundUpdate, null);
  const boundDelete = deleteCategoryAction.bind(null, category.id);
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(boundDelete, null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const prevDeleteOk = useRef(false);

  const [prevUpdateState, setPrevUpdateState] = useState(updateState);
  if (updateState !== prevUpdateState) {
    setPrevUpdateState(updateState);
    if (updateState?.ok) setIsEditing(false);
  }

  const [prevDeleteState, setPrevDeleteState] = useState(deleteState);
  if (deleteState !== prevDeleteState) {
    setPrevDeleteState(deleteState);
    if (deleteState && !deleteState.ok) setConfirmingDelete(false);
  }

  useEffect(() => {
    if (updateState?.ok) {
      toast(t("saveSuccess"));
      requestAnimationFrame(() => editButtonRef.current?.focus());
    }
  }, [updateState, t, toast]);

  useEffect(() => {
    if (deleteState?.ok && !prevDeleteOk.current) {
      toast(t("deleteSuccess"));
    }
    prevDeleteOk.current = Boolean(deleteState?.ok);
  }, [deleteState, t, toast]);

  useEffect(() => {
    if (confirmingDelete) confirmDeleteRef.current?.focus();
  }, [confirmingDelete]);

  async function move(delta: number) {
    if (isMoving) return;
    const to = index + delta;
    if (to < 0 || to >= allIds.length) return;
    setMoveError(null);
    setIsMoving(true);
    const next = [...allIds];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    const result = await reorderCategoriesAction(next);
    if (result.ok) {
      router.refresh();
      toast(t("reorderSuccess"));
    } else {
      setMoveError(result.error.message);
    }
    setIsMoving(false);
  }

  if (isEditing) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={4} className="px-5 py-4">
          <form action={updateFormAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`category-edit-ar-${category.id}`}>{t("nameArLabel")}</Label>
              <Input
                id={`category-edit-ar-${category.id}`}
                type="text"
                name="nameAr"
                defaultValue={category.nameAr}
                dir="rtl"
                required
                className="h-10 w-full rounded-xs border-border sm:w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`category-edit-fr-${category.id}`}>{t("nameFrLabel")}</Label>
              <Input
                id={`category-edit-fr-${category.id}`}
                type="text"
                name="nameFr"
                defaultValue={category.nameFr}
                dir="ltr"
                required
                className="h-10 w-full rounded-xs border-border sm:w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`category-edit-slug-${category.id}`}>{t("slugLabel")}</Label>
              <Input
                id={`category-edit-slug-${category.id}`}
                type="text"
                name="slug"
                defaultValue={category.slug}
                dir="ltr"
                required
                className="h-10 w-full rounded-xs border-border font-mono sm:w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={isUpdatePending}
                className="h-10 rounded-xs bg-ink px-4 text-sm text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
              >
                {isUpdatePending ? t("saveSubmitting") : t("saveSubmit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xs px-4 text-sm"
                onClick={() => {
                  setIsEditing(false);
                  requestAnimationFrame(() => editButtonRef.current?.focus());
                }}
              >
                {t("cancel")}
              </Button>
            </div>
            {updateState && !updateState.ok ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-plum" aria-live="polite">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                {updateState.error.message}
              </p>
            ) : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border transition-colors last:border-0 hover:bg-paper">
      <td className="px-5 py-4 text-sm font-medium text-ink" dir="rtl">
        {category.nameAr}
      </td>
      <td className="px-5 py-4 text-sm text-ink">{localized(locale, category.nameAr, category.nameFr)}</td>
      <td className="px-5 py-4 font-mono text-sm text-ink-soft">{category.slug}</td>
      <td className="px-5 py-4">
        {confirmingDelete ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">
              {t("deleteConfirmPrompt", { name: localized(locale, category.nameAr, category.nameFr) })}
            </p>
            <div className="flex items-center gap-2">
              <form action={deleteFormAction}>
                <Button
                  type="submit"
                  variant="outline"
                  ref={confirmDeleteRef}
                  disabled={isDeletePending}
                  className="h-9 rounded-xs border-plum px-4 text-xs text-plum transition-colors hover:bg-plum hover:text-paper"
                >
                  {isDeletePending ? t("deleteSubmitting") : t("delete")}
                </Button>
              </form>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-xs px-4 text-xs"
                onClick={() => setConfirmingDelete(false)}
              >
                {t("cancel")}
              </Button>
            </div>
            {deleteState && !deleteState.ok ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {deleteState.error.message}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1.5" aria-busy={isMoving}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t("moveUp")}
                disabled={isMoving || index === 0}
                onClick={() => move(-1)}
                className="flex size-11 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-30"
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("moveDown")}
                disabled={isMoving || index === allIds.length - 1}
                onClick={() => move(1)}
                className="flex size-11 items-center justify-center rounded-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-30"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <Button
                type="button"
                variant="ghost"
                ref={editButtonRef}
                className="h-8 rounded-xs px-3.5 text-xs"
                onClick={() => setIsEditing(true)}
              >
                {t("edit")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-8 rounded-xs px-3.5 text-xs"
                onClick={() => setConfirmingDelete(true)}
              >
                {t("delete")}
              </Button>
            </div>
            {deleteState && !deleteState.ok ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {deleteState.error.message}
              </p>
            ) : null}
            {moveError ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-plum" aria-live="polite">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {moveError}
              </p>
            ) : null}
          </div>
        )}
      </td>
    </tr>
  );
}
