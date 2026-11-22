"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { USERS_KEY, useSaveUser } from "@/features/users/api";
import { UserFormDialog } from "@/features/users/user-form-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { ROLE_LABEL, type User } from "@/lib/types";

/**
 * HALAMAN REFERENSI untuk modul lain: list + search + pagination + dialog create/edit.
 * Modul master data / transaksi cukup ikuti pola file ini.
 */
export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const save = useSaveUser();

  const query = useListQuery<User>(USERS_KEY, { page, limit: 10, search: debouncedSearch });

  const columns: DataTableColumns<User> = [
    { accessorKey: "name", header: "Nama" },
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <Badge variant="secondary">{ROLE_LABEL[row.original.role]}</Badge>,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => save.mutate({ id: row.original.id, isActive: !row.original.isActive })}
        >
          <Badge variant={row.original.isActive ? "default" : "outline"}>
            {row.original.isActive ? "Aktif" : "Nonaktif"}
          </Badge>
        </Button>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit"
          onClick={() => {
            setEditing(row.original);
            setOpen(true);
          }}
        >
          <Pencil />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="User" description="Kelola akun dan role pengguna" />
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
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Tambah user
          </Button>
        }
      />
      <UserFormDialog open={open} onOpenChange={setOpen} user={editing} />
    </>
  );
}
