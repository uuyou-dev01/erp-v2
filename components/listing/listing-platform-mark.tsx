import { cn } from "@/lib/utils";
import { getPlatformFallbackLabel, getPlatformVisual } from "@/lib/platform-icons";

interface ListingPlatformMarkProps {
  code: string;
  name: string;
  className?: string;
}

export function ListingPlatformMark({ code, name, className }: ListingPlatformMarkProps) {
  const visual = getPlatformVisual(code, name);
  const label = visual?.fallbackLabel ?? getPlatformFallbackLabel(code, name);

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background p-0.5 shadow-sm",
        className
      )}
      aria-label={name}
      title={name}
    >
      {visual?.iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visual.iconSrc}
          alt=""
          className="h-full w-full rounded-full object-contain"
          loading="lazy"
        />
      ) : (
        <span
          className={cn(
            "grid h-full w-full place-items-center rounded-full text-[11px] font-bold leading-none",
            visual?.fallbackClassName ?? "bg-muted text-muted-foreground"
          )}
          style={visual?.fallbackStyle}
        >
          {label}
        </span>
      )}
    </span>
  );
}
