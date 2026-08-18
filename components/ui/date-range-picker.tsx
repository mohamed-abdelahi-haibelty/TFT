"use client"

import * as React from "react"
import { ar, fr, type Locale } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const LOCALES: Record<"ar" | "fr", Locale> = { ar, fr }

function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Intl inserts bidi isolate marks (U+200E/U+200F/U+2066-2069) around numeric
// date parts for the "ar" locale. Those marks assume the string sits in an
// RTL paragraph; stripped here because the combined "from – to" label is
// rendered inside a forced dir="ltr" span so both dates and the dash stay in
// chronological left-to-right order instead of fighting the embedded marks.
const BIDI_MARKS = /[‎‏⁦-⁩]/g
function formatDateLabel(formatter: Intl.DateTimeFormat, date: Date): string {
  return formatter.format(date).replace(BIDI_MARKS, "")
}

export function DateRangePicker({
  locale,
  fromName,
  toName,
  defaultFrom,
  defaultTo,
  placeholder,
  clearLabel,
  doneLabel,
  ariaLabel,
  className,
}: {
  locale: "ar" | "fr"
  fromName: string
  toName: string
  defaultFrom?: string
  defaultTo?: string
  placeholder: string
  clearLabel: string
  doneLabel: string
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [range, setRange] = React.useState<DateRange | undefined>(() => ({
    from: parseDateValue(defaultFrom),
    to: parseDateValue(defaultTo),
  }))

  const formatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar" : "fr-FR", {
        dateStyle: "medium",
        numberingSystem: "latn",
      }),
    [locale],
  )

  const label = React.useMemo(() => {
    if (!range?.from) return placeholder
    if (!range.to || range.to.getTime() === range.from.getTime()) {
      return formatDateLabel(formatter, range.from)
    }
    return `${formatDateLabel(formatter, range.from)} – ${formatDateLabel(formatter, range.to)}`
  }, [range, formatter, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={fromName} value={range?.from ? toDateValue(range.from) : ""} />
      <input type="hidden" name={toName} value={range?.to ? toDateValue(range.to) : ""} />
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className={cn(
              "h-11 justify-start gap-2 rounded-md px-3 text-sm font-normal text-ink",
              !range?.from && "text-ink-soft",
              className,
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0 text-ink-soft" />
        <span className="truncate" dir="ltr">
          {label}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          locale={LOCALES[locale]}
          numberOfMonths={2}
          defaultMonth={range?.from}
          selected={range}
          onSelect={setRange}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border p-2.5">
          <button
            type="button"
            onClick={() => setRange(undefined)}
            disabled={!range?.from}
            className="text-xs font-medium text-ink-soft hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {clearLabel}
          </button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            {doneLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
