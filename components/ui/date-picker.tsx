"use client"

import * as React from "react"
import { ar, fr, type Locale } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const LOCALES: Record<"ar" | "fr", Locale> = { ar, fr }

function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined
  const normalized = value.length === 7 ? `${value}-01` : value
  const parsed = new Date(`${normalized}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toMonthValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * shadcn-style single date picker (Popover + Calendar + Button). The chosen
 * value is submitted through a hidden input: `YYYY-MM-DD` for `format="date"`
 * (default) or `YYYY-MM` for `format="month"` (e.g. the dashboard's month
 * filter). Defaults are parsed from the same shape, so GET-filter forms
 * round-trip their query values unchanged.
 */
export function DatePicker({
  locale,
  name,
  defaultValue,
  placeholder,
  clearLabel,
  ariaLabel,
  format = "date",
  className,
  id,
  onValueChange,
}: {
  locale: "ar" | "fr"
  name: string
  defaultValue?: string
  placeholder: string
  clearLabel: string
  ariaLabel?: string
  format?: "date" | "month"
  className?: string
  id?: string
  /** Fires with `YYYY-MM-DD` (or `YYYY-MM`) when a date is chosen, and `undefined` on clear. */
  onValueChange?: (value: string | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState<Date | undefined>(() => parseDateValue(defaultValue))

  const formatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
        ...(format === "month" ? { month: "long", year: "numeric" } : { dateStyle: "medium" }),
        numberingSystem: "latn",
      }),
    [locale, format],
  )

  const label = value ? formatter.format(value) : placeholder
  const hiddenValue = value ? (format === "month" ? toMonthValue(value) : toDateValue(value)) : ""

  function commit(date: Date | undefined) {
    setValue(date)
    onValueChange?.(date ? (format === "month" ? toMonthValue(date) : toDateValue(date)) : undefined)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={hiddenValue} />
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-label={ariaLabel}
            className={cn(
              "h-11 justify-start gap-2 rounded-md px-3 text-sm font-normal text-ink",
              !value && "text-ink-soft",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 text-ink-soft" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={LOCALES[locale]}
          defaultMonth={value}
          selected={value}
          onSelect={(date) => {
            commit(date)
            if (date) setOpen(false)
          }}
        />
        <div className="flex items-center justify-end gap-2 border-t border-border p-2.5">
          <button
            type="button"
            onClick={() => commit(undefined)}
            disabled={!value}
            className="text-xs font-medium text-ink-soft hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {clearLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
