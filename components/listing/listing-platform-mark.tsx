import { cn } from "@/lib/utils";

interface ListingPlatformMarkProps {
  code: string;
  name: string;
  className?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  mercari: "Me",
  xianyu: "闲",
  ebay: "eB",
  rakuten: "Ra",
  yahoo: "Ya",
};

export function ListingPlatformMark({
  code,
  name,
  className,
}: ListingPlatformMarkProps) {
  const normalizedCode = code.toLowerCase();
  const label =
    PLATFORM_LABELS[normalizedCode] ??
    code
      .split(/[-_\s]/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ??
    name.slice(0, 1);

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-semibold",
        className
      )}
      title={name}
    >
      {label || name.slice(0, 1)}
    </span>
  );
}
