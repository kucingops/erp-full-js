"use client";

import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountFormDialog } from "@/features/accounting/account-form-dialog";
import { AccountingTabs } from "@/features/accounting/accounting-ui";
import { useAccounts, useDeleteAccount } from "@/features/accounting/api";
import { ACCOUNT_TYPE_LABEL, type Account } from "@/features/accounting/types";
import { cn } from "@/lib/utils";

/** Urutkan sebagai pohon (induk lalu anak-anaknya) dan hitung kedalaman untuk indent. */
function asTree(accounts: Account[]) {
  const children = new Map<string | null, Account[]>();
  const ids = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    const key = a.parentId && ids.has(a.parentId) ? a.parentId : null;
    children.set(key, [...(children.get(key) ?? []), a]);
  }
  const out: { account: Account; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of (children.get(parent) ?? []).sort((x, y) => x.code.localeCompare(y.code))) {
      out.push({ account: a, depth });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function AccountsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const query = useAccounts({ includeInactive: showInactive });
  const del = useDeleteAccount();

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (!search) return asTree(all);
    const s = search.toLowerCase();
    return all
      .filter((a) => a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s))
      .map((account) => ({ account, depth: 0 }));
  }, [query.data, search]);

  return (
    <>
      <PageHeader
        title="Akuntansi"
        description="Bagan akun (chart of accounts). Akun bergembok dipakai jurnal otomatis."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> Tambah akun
          </Button>
        }
      />
      <AccountingTabs />
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Input
          className="max-w-xs"
          placeholder="Cari kode / nama akun..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Tampilkan akun nonaktif
        </label>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ account: a, depth }) => (
                <TableRow key={a.id} className={cn(!a.isActive && "opacity-60")}>
                  <TableCell className={cn("tabular-nums", !a.isPostable && "font-semibold")}>{a.code}</TableCell>
                  <TableCell className={cn(!a.isPostable && "font-semibold")}>
                    <span style={{ paddingLeft: depth * 20 }} className="inline-flex items-center gap-1.5">
                      {a.name}
                      {a.isSystem && <Lock className="size-3 text-muted-foreground" aria-label="Akun sistem" />}
                    </span>
                    {a.description && <div className="text-xs text-muted-foreground" style={{ paddingLeft: depth * 20 }}>{a.description}</div>}
                  </TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABEL[a.type]}</TableCell>
                  <TableCell className="space-x-1">
                    {!a.isPostable && <Badge variant="outline">Header</Badge>}
                    {!a.isActive && <Badge variant="outline">Nonaktif</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit"
                      onClick={() => {
                        setEditing(a);
                        setOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    {!a.isSystem && (a._count?.lines ?? 0) === 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hapus"
                        disabled={del.isPending}
                        onClick={() => confirm(`Hapus akun ${a.code} ${a.name}?`) && del.mutate(a.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AccountFormDialog open={open} onOpenChange={setOpen} account={editing} accounts={query.data ?? []} />
    </>
  );
}
