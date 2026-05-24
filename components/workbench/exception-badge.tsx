import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ExceptionBadgeProps {
  message?: string | null;
  type?: string | null;
  className?: string;
}

export function ExceptionBadge({ message, type, className }: ExceptionBadgeProps) {
  if (!message && !type) return null;
  return (
    <Badge variant="destructive" className={cn("h-5 px-1.5 text-[10px] font-normal", className)}>
      {message ?? type}
    </Badge>
  );
}
