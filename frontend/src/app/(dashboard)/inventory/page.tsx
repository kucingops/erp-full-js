"use client";

import { History, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdjustmentFormDialog } from "@/features/inventory/adjustment-form-dialog";
import { STOCKS_KEY } from "@/features/inventory/api";
import { InventoryTabs } from "@/features/inventory/inventory-tabs";
import type { Stock } from "@/features/inventory/types";
import { WarehouseFilter } from "@/features/inventory/warehouse-filter";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const debouncedSearch = useDebounce(search);
  const [adjusting, setAdjusting] = useState<Stock | null>(null);
  const [open, setOpen] = useState(false);
  // Sama dengan @Roles(Role.WAREHOUSE) di POST /inventory/adjustments
  const canAdjust = canAccess(useAuthStore((s) => s.user?.role), ["WAREHOUSE"]);

  const query = useListQuery<Stock>(STOCKS_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    warehouseId,
    lowStock: lowStock || undefined,
  });

  const openAdjust = (stock: Stock | null) => {
    setAdjusting(stock);
    setOpen(true);
  };

  const columns: DataTableColumns<Stock> = [
    {
      id: "sku",
      header: "SKU",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.product.sku}</span>,
    },
    { id: "product", header: "Produk", cell: ({ row }) => row.original.product.name },
    { id: "warehouse", header: "Gudang", cell: ({ row }) => row.original.warehouse.name },
    {
      accessorKey: "quantity",
      header: "Stok",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">
              {s.quantity} {s.product.unit}
            </span>
            {s.isLowStock && (
              <Badge variant="destructive">
                <TriangleAlert /> Menipis
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: "minStock",
      header: "Min.",
      cell: ({ row }) => <span className="tabular-nums">{row.original.product.minStock}</span>,
    },
    {
      accessorKey: "updatedAt",
      header: "Update terakhir",
      cell: ({ row }) => dateFmt.format(new Date(row.original.updatedAt)),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Kartu stok"
            title="Kartu stok"
            render={
              <Link
                href={`/inventory/movements?productId=${row.original.productId}&warehouseId=${row.original.warehouseId}`}
              />
            }
          >
            <History />
          </Button>
          {canAdjust && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Penyesuaian"
              title="Penyesuaian"
              onClick={() => openAdjust(row.original)}
            >
              <SlidersHorizontal />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Inventory" description="Saldo stok setiap produk di setiap gudang" />
      <InventoryTabs />
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
          <div className="flex flex-wrap gap-2">
            <WarehouseFilter
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setPage(1);
              }}
            />
            <Button
              variant={lowStock ? "default" : "outline"}
              onClick={() => {
                setLowStock((v) => !v);
                setPage(1);
              }}
            >
              <TriangleAlert /> Stok menipis
            </Button>
            {canAdjust && (
              <Button onClick={() => openAdjust(null)}>
                <SlidersHorizontal /> Penyesuaian
              </Button>
            )}
          </div>
        }
      />
      <AdjustmentFormDialog open={open} onOpenChange={setOpen} stock={adjusting} />
    </>
  );
}
