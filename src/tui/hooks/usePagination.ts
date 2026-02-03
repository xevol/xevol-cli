import { useCallback, useState } from "react";

interface PaginationValues {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaginationState extends PaginationValues {
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setPagination: (next: Partial<PaginationValues>) => void;
  nextPage: () => void;
  prevPage: () => void;
}

export function usePagination(initialPage = 1, initialLimit = 20): PaginationState {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setPagination = useCallback((next: Partial<PaginationValues>) => {
    if (typeof next.page === "number") setPage(next.page);
    if (typeof next.limit === "number") setLimit(next.limit);
    if (typeof next.total === "number") setTotal(next.total);
    if (typeof next.totalPages === "number") setTotalPages(next.totalPages);
  }, []);

  const nextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1));
  }, []);

  return {
    page,
    limit,
    total,
    totalPages,
    setPage,
    setLimit,
    setPagination,
    nextPage,
    prevPage,
  };
}
