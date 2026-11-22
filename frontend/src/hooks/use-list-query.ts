"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListParams, Paginated } from "@/lib/types";

/**
 * Hook standar untuk endpoint list ber-pagination.
 * Query key = [resource, params] supaya cache per halaman/filter.
 * @example const q = useListQuery<Product>("products", { page, search });
 */
export function useListQuery<T>(resource: string, params: ListParams) {
  return useQuery({
    queryKey: [resource, params],
    queryFn: () => api<Paginated<T>>(`/${resource}`, { query: params }),
    placeholderData: keepPreviousData,
  });
}
