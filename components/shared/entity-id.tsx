import { formatShortEntityId } from "@/lib/format-id";

interface EntityIdProps {
  id: string;
  className?: string;
}

export function EntityId({ id, className }: EntityIdProps) {
  return (
    <span className={className ?? "font-mono text-xs"} title={id}>
      {formatShortEntityId(id)}
    </span>
  );
}
