"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUDIT_KEY, useAuditEntities } from "@/features/audit/api";
import { AuditLogTable } from "@/features/audit/audit-log-table";
import { ACTION_LABEL, entityLabel, type AuditAction, type AuditLog } from "@/features/audit/types";
import { useOptions } from "@/features/reports/api";
import { DateRange, FilterSelect } from "@/features/reports/report-ui";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

const ACTION_OPTIONS = (Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => ({
  value: a,
  label: ACTION_LABEL[a],
}));

/** useSearchParams wajib di dalam Suspense supaya halaman tetap bisa di-prerender. */
export default function AuditLogsPage() {
  return (
    <Suspense>
      <AuditLogs />
    </Suspense>
  );
}

function AuditLogs() {
  const router = useRouter();
  const params = useSearchParams();
  // Filter dari link "Riwayat perubahan" (mis. di halaman user): ?entity=user&entityId=...
  const entityId = params.get("entityId") ?? "";
  const [entity, setEntity] = useState(params.get("entity") ?? "");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search);

  const entities = useAuditEntities();
  const users = useOptions("users");

  const query = useListQuery<AuditLog>(AUDIT_KEY, {
    page,
    limit: 20,
    search: debouncedSearch,
    entity,
    entityId,
    userId,
    action,
    // Backend menganggap tanggal sebagai hari kalender WIB.
    from: range.from,
    to: range.to,
  });

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Riwayat siapa mengubah apa dan kapan. Klik baris untuk lihat data sebelum & sesudah."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="Cari user / ID data..."
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
        />
        <FilterSelect
          value={entity}
          onChange={reset(setEntity)}
          options={(entities.data ?? []).map((e) => ({ value: e, label: entityLabel(e) }))}
          allLabel="Semua entity"
          ariaLabel="Filter entity"
        />
        <FilterSelect
          value={userId}
          onChange={reset(setUserId)}
          options={users.data ?? []}
          allLabel="Semua user"
          ariaLabel="Filter user"
        />
        <FilterSelect
          value={action}
          onChange={reset(setAction)}
          options={ACTION_OPTIONS}
          allLabel="Semua aksi"
          className="w-40"
          ariaLabel="Filter aksi"
        />
        <DateRange from={range.from} to={range.to} onChange={reset(setRange)} />
        {entityId && (
          <Button variant="outline" size="sm" onClick={() => router.replace("/audit-logs")}>
            ID data: <span className="font-mono">{entityId.slice(0, 8)}</span> <X />
          </Button>
        )}
      </div>
      <AuditLogTable result={query.data} isLoading={query.isLoading} onPageChange={setPage} />
    </>
  );
}
