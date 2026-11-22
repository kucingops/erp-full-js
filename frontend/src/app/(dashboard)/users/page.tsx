"use client";

import { History, KeyRound, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActiveFilterSelect, StatusCell } from "@/features/master-data/components";
import { useMasterList } from "@/features/master-data/use-master-list";
import { FilterSelect } from "@/features/reports/report-ui";
import { USERS_KEY } from "@/features/users/api";
import { ResetPasswordDialog, ToggleActiveDialog } from "@/features/users/user-dialogs";
import { UserFormDialog } from "@/features/users/user-form-dialog";
import { useAuthStore } from "@/lib/auth-store";
import { ROLE_LABEL, type Role, type User } from "@/lib/types";

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

/**
 * HALAMAN REFERENSI untuk modul lain: list + search + filter + sort + pagination + dialog.
 * Aksi khusus (nonaktifkan, reset password) pakai endpoint sub-route sendiri, bukan PATCH.
 */
export default function UsersPage() {
  const [role, setRole] = useState("");
  const list = useMasterList<User>(
    USERS_KEY,
    { sortBy: "createdAt", sortOrder: "desc" },
    { role: role || undefined },
  );
  const meId = useAuthStore((s) => s.user?.id);
  const [editing, setEditing] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);

  const sortable = (text: string, field: string) =>
    function SortHeader() {
      return (
        <SortableHeader label={text} field={field} sort={list.sort} onSort={list.toggleSort} />
      );
    };

  const columns: DataTableColumns<User> = [
    {
      accessorKey: "name",
      header: sortable("Nama", "name"),
      cell: ({ row }) => (
        <span>
          {row.original.name}
          {row.original.id === meId && (
            <span className="ml-1 text-xs text-muted-foreground">(kamu)</span>
          )}
        </span>
      ),
    },
    { accessorKey: "email", header: sortable("Email", "email") },
    {
      accessorKey: "role",
      header: sortable("Role", "role"),
      cell: ({ row }) => <Badge variant="secondary">{ROLE_LABEL[row.original.role]}</Badge>,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <StatusCell
          active={row.original.isActive}
          // Akun sendiri tidak bisa dinonaktifkan (backend juga menolak).
          onToggle={row.original.id === meId ? undefined : () => setToggling(row.original)}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset password"
            onClick={() => setResetting(row.original)}
          >
            <KeyRound />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Riwayat perubahan"
            nativeButton={false}
            render={<Link href={`/audit-logs?entity=user&entityId=${row.original.id}`} />}
          >
            <History />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="User" description="Kelola akun, role, dan status pengguna" />
      <DataTable
        columns={columns}
        result={list.query.data}
        isLoading={list.query.isLoading}
        search={list.search}
        onSearchChange={list.setSearch}
        onPageChange={list.setPage}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={role}
              onChange={(v) => {
                setRole(v);
                list.setPage(1);
              }}
              options={ROLE_OPTIONS}
              allLabel="Semua role"
              className="w-40"
              ariaLabel="Filter role"
            />
            <ActiveFilterSelect value={list.active} onChange={list.setActive} />
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus /> Tambah user
            </Button>
          </div>
        }
      />
      <UserFormDialog open={open} onOpenChange={setOpen} user={editing} />
      <ResetPasswordDialog user={resetting} onOpenChange={(o) => !o && setResetting(null)} />
      <ToggleActiveDialog user={toggling} onOpenChange={(o) => !o && setToggling(null)} />
    </>
  );
}
