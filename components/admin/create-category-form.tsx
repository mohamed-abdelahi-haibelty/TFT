"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { slugify } from "@/src/lib/slug";
import { createCategoryAction } from "@/src/services/category-actions";

export function CreateCategoryForm() {
  const t = useTranslations("admin.categories");
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createCategoryAction, null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const slugTouchedRef = useRef(false);

  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) setIsOpen(false);
  }

  useEffect(() => {
    if (state?.ok) {
      slugTouchedRef.current = false;
      toast(t("addSuccess"));
    }
  }, [state, t, toast]);

  return (
    <>
      <Button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "category-create-panel" : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className="h-10 rounded-xs bg-ink px-5 text-sm text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)]"
      >
        {t("addTitle")}
      </Button>
      {isOpen ? (
        <section
          id="category-create-panel"
          aria-label={t("addTitle")}
          className="w-full basis-full rounded-lg border border-border p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-heading text-lg font-semibold text-ink">{t("addTitle")}</h2>
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-xs px-4 text-sm"
              onClick={() => setIsOpen(false)}
            >
              {t("cancel")}
            </Button>
          </div>

          <form action={formAction} className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-name-ar">{t("nameArLabel")}</Label>
              <Input
                id="category-name-ar"
                type="text"
                name="nameAr"
                dir="rtl"
                required
                className="h-10 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-name-fr">{t("nameFrLabel")}</Label>
              <Input
                id="category-name-fr"
                name="nameFr"
                type="text"
                dir="ltr"
                required
                onChange={(event) => {
                  if (!slugTouchedRef.current && slugInputRef.current) {
                    slugInputRef.current.value = slugify(event.target.value);
                  }
                }}
                className="h-10 rounded-xs border-border px-3.5 focus-visible:border-ink focus-visible:ring-0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-slug">{t("slugLabel")}</Label>
              <Input
                id="category-slug"
                name="slug"
                type="text"
                dir="ltr"
                required
                ref={slugInputRef}
                onChange={() => {
                  slugTouchedRef.current = true;
                }}
                className="h-10 rounded-xs border-border px-3.5 font-mono focus-visible:border-ink focus-visible:ring-0"
              />
            </div>

            <div className="sm:col-span-3" aria-live="polite">
              {state && !state.ok ? (
                <p role="alert" className="flex items-start gap-2 rounded-xs border border-plum px-3.5 py-2.5 text-sm font-medium text-plum">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {state.error.message}
                </p>
              ) : null}
            </div>

            <div className="sm:col-span-3">
              <Button
                type="submit"
                disabled={isPending}
                className="h-10 rounded-xs bg-ink px-5 text-paper transition-colors hover:bg-[color-mix(in_oklch,var(--ink),white_10%)] disabled:opacity-70"
              >
                {isPending ? t("addSubmitting") : t("addSubmit")}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
