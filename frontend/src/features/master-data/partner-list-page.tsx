"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/types";
import { useDeleteResource, useSaveResource } from "./api";
import { ActiveFilterSelect, RowActions, StatusCell } from "./components";
import { PartnerFormDialog, type PartnerInput } from "./partner-form-dialog";
import type { Partner } from "./types";
import { useCanWrite, useMasterList } from "./use-master-list";

/** Halaman list Customer / Supplier. Satu komponen, beda konfigurasi. */
export function PartnerListPage({
  resource,
  label,
  description,
  codePlaceholder,
  writeRoles,
}: {
  resource: string;
  label: string;
  description: string;
  codePlaceholder: string;
  writeRoles: Role[];
}) {
  const list = useMasterList<Partner>(resource, { sortBy: "code", sortOrder: "asc" });
  const canWrite = useCanWrite(writeRoles);
  const save = useSaveResource<Partner, PartnerInput>(resource, label);
  const remove = useDeleteResource(resource, label);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [open, setOpen] = useState(false);

  const sortable = (text: string, field: string) =>
    function SortHeader() {
      return (
        <SortableHeader label={text} field={field} sort={list.sort} onSort={list.toggleSort} />
      );
    };

  const columns: DataTableColumns<Partner> = [
    { accessorKey: "code", header: sortable("Kode", "code"), cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
    { accessorKey: "name", header: sortable("Nama", "name") },
    { accessorKey: "email", header: sortable("Email", "email"), cell: ({ row }) => row.original.email ?? "-" },
    { accessorKey: "phone", header: "Telepon", cell: ({ row }) => row.original.phone ?? "-" },
    {
      accessorKey: "address",
      header: "Alamat",
      cell: ({ row }) => (
        <span className="line-clamp-1 max-w-56" title={row.original.address ?? undefined}>
          {row.original.address ?? "-"}
        </span>
      ),
    },
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
        ] satisfies DataTableColumns<Partner>)
      : []),
  ];

  return (
    <>
      <PageHeader title={label} description={description} />
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
                <Plus /> Tambah {label.toLowerCase()}
              </Button>
            )}
          </div>
        }
      />
      <PartnerFormDialog
        resource={resource}
        label={label}
        codePlaceholder={codePlaceholder}
        open={open}
        onOpenChange={setOpen}
        partner={editing}
      />
    </>
  );
}
