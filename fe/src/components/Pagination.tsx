import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: number[];
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
};

function getVisiblePages(page: number, totalPages: number) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const maxVisible = 5;
  const start = Math.min(safePage, Math.max(1, safeTotalPages - maxVisible + 1));
  const end = Math.min(safeTotalPages, start + maxVisible - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function Pagination({
  page,
  totalPages,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  disabled = false,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const visiblePages = getVisiblePages(safePage, safeTotalPages);
  const isFirstPage = safePage <= 1;
  const isLastPage = safePage >= safeTotalPages;

  const goToPage = (nextPage: number) => {
    const clampedPage = Math.min(Math.max(1, nextPage), safeTotalPages);
    if (clampedPage !== safePage) {
      onPageChange(clampedPage);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span>
          Halaman {safePage} dari {safeTotalPages}
        </span>
        <label className="flex items-center gap-2">
          <span>Tampilkan</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-lg border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span>data</span>
        </label>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Pagination">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isFirstPage}
          onClick={() => goToPage(1)}
          aria-label="Halaman pertama"
        >
          {"<<"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isFirstPage}
          onClick={() => goToPage(safePage - 1)}
        >
          Prev
        </Button>

        {visiblePages.map((item) => (
          <Button
            key={item}
            type="button"
            variant={item === safePage ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => goToPage(item)}
            className="min-w-9 px-3"
            aria-current={item === safePage ? "page" : undefined}
          >
            {item}
          </Button>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isLastPage}
          onClick={() => goToPage(safePage + 1)}
        >
          Next
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isLastPage}
          onClick={() => goToPage(safeTotalPages)}
          aria-label="Halaman terakhir"
        >
          {">>"}
        </Button>
      </nav>
    </div>
  );
}
