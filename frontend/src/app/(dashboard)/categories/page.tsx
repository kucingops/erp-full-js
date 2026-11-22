"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader, useSort } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CATEGORIES_KEY, useDeleteResource } from "@/features/master-data/api";
import { CategoryFormDialog } from "@/features/master-data/category-form-dialog";
import { RowActions } from "@/features/master-data/components";
import type { Category } from "@/features/master-data/types";
import { useCanWrite } from "@/features/master-data/use-master-list";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

/** Kategori tidak punya status aktif, jadi pakai state list sendiri (tanpa filter status). */
export default function CategoriesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { sort, toggle } = useSort({ sortBy: "name", sortOrder: "asc" });
  const canWrite = useCanWrite(["WAREHOUSE"]);
  const remove = useDeleteResource(CATEGORIES_KEY, "Kategori");
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);

  const query = useListQuery<Category>(CATEGORIES_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    ...sort,
  });

  const columns: DataTableColumns<Category> = [
    {
      accessorKey: "name",
      header: () => (
        <SortableHeader
          label="Nama"
          field="name"
          sort={sort}
          onSort={(f) => {
            toggle(f);
            setPage(1);
          }}
        />
      ),
    },
    {
      id: "products",
      header: "Jumlah produk",
      cell: ({ row }) => row.original._count?.products ?? 0,
    },
    ...(canWrite
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <RowActions
                name={row.original.name}
                deleting={remove.isPending}
                onEdit={() => {
                  setEditing(row.original);
                  setOpen(true);
                }}
                onDelete={() => remove.mutateAsync(row.original.id)}
              />
            ),
          },
        ] satisfies DataTableColumns<Category>)
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Kategori Produk"
        description="Menghapus kategori tidak menghapus produknya (produk jadi tanpa kategori)"
      />
      <DataTable
        columns={columns}
        result={query.data}
        isLoading={query.isLoading}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onPageChange={setPage}
        toolbar={
          canWrite && (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus /> Tambah kategori
            </Button>
          )
        }
      />
      <CategoryFormDialog open={open} onOpenChange={setOpen} category={editing} />
    </>
  );
}
