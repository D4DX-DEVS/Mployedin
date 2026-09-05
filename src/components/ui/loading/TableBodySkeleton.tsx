import { TableCell, TableRow } from "@/components/ui/table";

interface TableBodySkeletonProps {
  rows?: number;
  cols?: number;
}

/**
 * Loading rows that live inside a real `<TableBody>`.
 *
 * `TableRowsSkeleton` renders `<div>`s, so it cannot go inside a table — which
 * is why twelve admin pages each hand-wrote the same shimmer cell markup
 * instead, and why the loading state drifted from page to page (five rows here,
 * six there, a different gradient in the third). One component, one shape.
 */
export function TableBodySkeleton({ rows = 5, cols = 5 }: TableBodySkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <TableCell key={colIndex} className="px-4 py-3">
              <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
