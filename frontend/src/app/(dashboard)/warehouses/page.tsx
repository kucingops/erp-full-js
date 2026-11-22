"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WAREHOUSES_KEY, useDeleteResource } from "@/features/master-data/api";
import { ActiveFilterSelect, RowActions, StatusCell } from "@/features/master-data/components";
import type { Warehouse } from "@/features/master-data/types";
import { useCanWrite, useMasterList } from "@/features/master-data/use-master-list";
import { WarehouseFormDialog, useSaveWarehouse } from "@/features/master-data/warehouse-form-dialog";

export default function WarehousesPage() {
  const list = useMasterList<Warehouse>(WAREHOUSES_KEY, { sortBy: "code", sortOrder: "asc" });
  const canWrite = useCanWrite(["ADMIN"]);
  const save = useSaveWarehouse();
  const remove = useDeleteResource(WAREHOUSES_KEY, "Gudang");
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [open, setOpen] = useState(false);

  const sortable = (text: string, field: string) =>
    function SortHeader() {
      return (
        <SortableHeader label={text} field={field} sort={list.sort} onSort={list.toggleSort} />
      );
    };

  const columns: DataTableColumns<Warehouse> = [
    { accessorKey: "code", header: sortable("Kode", "code"), cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
    { accessorKey: "name", header: sortable("Nama", "name") },
    { accessorKey: "address", header: "Alamat", cell: ({ row }) => row.original.address ?? "-" },
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
        ] satisfies DataTableColumns<Warehouse>)
      : []),
  ];

  return (
    <>
      <PageHeader title="Gudang" description="Lokasi penyimpanan stok" />
      <DataTable
        columns={columns}
        result={list.query.data}
        isLoading={list.query.isLoading}
        search={list.search}
        onSearchChange={list.setSearch}
        onPageChange={list.setPage}
        toolbar={
          <div className="flex gap-2">
            <ActiveFilterSelect value={list.active} onChange={list.setActive} />
            {canWrite && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus /> Tambah gudang
              </Button>
            )}
          </div>
        }
      />
      <WarehouseFormDialog open={open} onOpenChange={setOpen} warehouse={editing} />
    </>
  );
}
