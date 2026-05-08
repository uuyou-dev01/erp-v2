import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

function isInteractiveElement(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a, button, input, select, textarea, [role='button']"))
    : false;
}

export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  emptyState,
  onRowClick,
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const getRowClickProps = (row: T) =>
    onRowClick
      ? {
          className: "cursor-pointer",
          onClick: (event: React.MouseEvent) => {
            if (isInteractiveElement(event.target)) return;
            onRowClick(row);
          },
        }
      : {};
  const getMobileCardProps = (row: T) =>
    onRowClick
      ? {
          className: "rounded-lg border bg-card p-4 space-y-2 cursor-pointer",
          onClick: (event: React.MouseEvent) => {
            if (isInteractiveElement(event.target)) return;
            onRowClick(row);
          },
        }
      : {
          className: "rounded-lg border bg-card p-4 space-y-2",
        };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={keyExtractor(row)}
                {...getRowClickProps(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>{col.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {data.map((row) => (
          <div
            key={keyExtractor(row)}
            {...getMobileCardProps(row)}
          >
            {mobileColumns.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground shrink-0">
                  {col.mobileLabel || col.header}
                </span>
                <span className="text-sm text-right">{col.cell(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
