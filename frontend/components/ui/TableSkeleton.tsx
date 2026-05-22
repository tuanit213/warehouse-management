'use client';

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  hasImageColumn?: boolean;
};

export function TableSkeleton({ rows = 6, columns = 6, hasImageColumn = false }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr className="skeleton-row" key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex}>
              <span className={hasImageColumn && columnIndex === 0 ? 'skeleton-cell with-image' : 'skeleton-cell'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
