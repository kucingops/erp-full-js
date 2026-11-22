"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuditJson } from "./types";

/** Field yang selalu berubah tiap update; disembunyikan di mode "hanya yang berubah". */
const NOISE = new Set(["updatedAt"]);

const show = (v: unknown) =>
  v === undefined ? "" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Bandingkan before/after per field (top-level). Hasilnya diurutkan: yang berubah dulu. */
export function diffRows(before: AuditJson, after: AuditJson) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .map((key) => {
      const b = before?.[key];
      const a = after?.[key];
      return { key, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) };
    })
    .sort((x, y) => Number(y.changed) - Number(x.changed));
}

/** Tabel sebelum / sesudah dengan highlight field yang berubah. */
export function AuditDiff({ before, after }: { before: AuditJson; after: AuditJson }) {
  const rows = diffRows(before, after);
  const hasBoth = !!before && !!after;
  const [onlyChanged, setOnlyChanged] = useState(hasBoth);
  const visible = onlyChanged ? rows.filter((r) => r.changed && !NOISE.has(r.key)) : rows;

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada snapshot data.</p>;
  }

  return (
    <div className="space-y-2">
      {hasBoth && (
        <Button variant="outline" size="xs" onClick={() => setOnlyChanged((v) => !v)}>
          {onlyChanged ? "Tampilkan semua field" : "Hanya yang berubah"}
        </Button>
      )}
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-48 px-3 py-1.5 font-medium">Field</th>
              <th className="px-3 py-1.5 font-medium">Sebelum</th>
              <th className="px-3 py-1.5 font-medium">Sesudah</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={cn("border-t align-top", r.changed && hasBoth && "bg-amber-500/10")}>
                <td className="px-3 py-1.5 font-mono">{r.key}</td>
                <td className="max-w-md px-3 py-1.5 font-mono break-all text-muted-foreground">
                  {show(r.before)}
                </td>
                <td className="max-w-md px-3 py-1.5 font-mono break-all">{show(r.after)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">
                  Tidak ada field yang berubah.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
