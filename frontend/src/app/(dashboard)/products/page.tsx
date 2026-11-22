"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES_KEY, PRODUCTS_KEY, useDeleteResource } from "@/features/master-data/api";
import { ActiveFilterSelect, RowActions, StatusCell } from "@/features/master-data/components";
import { formatRupiah } from "@/features/master-data/format";
import { ProductFormDialog, useSaveProduct } from "@/features/master-data/product-form-dialog";
import type { Category, Product } from "@/features/master-data/types";
import { useCanWrite, useMasterList } from "@/features/master-data/use-master-list";
import { useListQuery } from "@/hooks/use-list-query";

const ALL = "all";

export default function ProductsPage() {
  const [categoryId, setCategoryId] = useState(ALL);
  const list = useMasterList<Product>(
    PRODUCTS_KEY,
    { sortBy: "name", sortOrder: "asc" },
    { categoryId: categoryId === ALL ? undefined : categoryId },
  );
  const categories = useListQuery<Category>(CATEGORIES_KEY, {
    limit: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const categoryName = new Map(categories.data?.data.map((c) => [c.id, c.name]));

  const canWrite = useCanWrite(["WAREHOUSE"]);
  const save = useSaveProduct();
  const remove = useDeleteResource(PRODUCTS_KEY, "Produk");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  // Fungsi bernama (bukan arrow anonim) supaya lint react/display-name puas.
  const sortable = (text: string, field: string) =>
    function SortHeader() {
      return (
        <SortableHeader label={text} field={field} sort={list.sort} onSort={list.toggleSort} />
      );
    };

  const columns: DataTableColumns<Product> = [
    {
      accessorKey: "sku",
      header: sortable("SKU", "sku"),
      cell: ({ row }) => <span className="font-mono">{row.original.sku}</span>,
    },
    { accessorKey: "name", header: sortable("Nama", "name") },
    {
      id: "category",
      header: "Kategori",
      cell: ({ row }) =>
        row.original.category ? (
          <Badge variant="secondary">{row.original.category.name}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    { accessorKey: "unit", header: sortable("Satuan", "unit") },
    {
      accessorKey: "costPrice",
      header: sortable("Harga beli", "costPrice"),
      cell: ({ row }) => formatRupiah(row.original.costPrice),
    },
    {
      accessorKey: "salePrice",
      header: sortable("Harga jual", "salePrice"),
      cell: ({ row }) => formatRupiah(row.original.salePrice),
    },
    { accessorKey: "minStock", header: sortable("Stok min.", "minStock") },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <StatusCell
          active={row.original.isActive}
          onToggle={
            canWrite
              ? () => save.mutate({ id: row.original.id, isActive: !row.original.isActive })
              : undefined
          }
        />
      ),
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
        ] satisfies DataTableColumns<Product>)
      : []),
  ];

  return (
    <>
      <PageHeader title="Produk" description="Daftar barang: SKU, harga, satuan, dan kategori" />
      <DataTable
        columns={columns}
        result={list.query.data}
        isLoading={list.query.isLoading}
        search={list.search}
        onSearchChange={list.setSearch}
        onPageChange={list.setPage}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <Select
              value={categoryId}
              onValueChange={(v) => {
                setCategoryId(v as string);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Filter kategori">
                <SelectValue>
                  {(v: string) => (v === ALL ? "Semua kategori" : (categoryName.get(v) ?? "..."))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua kategori</SelectItem>
                {categories.data?.data.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ActiveFilterSelect value={list.active} onChange={list.setActive} />
            {canWrite && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus /> Tambah produk
              </Button>
            )}
          </div>
        }
      />
      <ProductFormDialog open={open} onOpenChange={setOpen} product={editing} />
    </>
  );
}
