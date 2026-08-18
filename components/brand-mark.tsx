import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-gold bg-ink font-display font-bold text-gold",
        className,
      )}
    >
      T
    </span>
  );
}
