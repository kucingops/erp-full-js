"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWarehouseOptions } from "./api";

const ALL = "all";

/** Dropdown filter gudang. `value` kosong = semua gudang. */
export function WarehouseFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (warehouseId: string) => void;
}) {
  const warehouses = useWarehouseOptions();
  const options = warehouses.data ?? [];
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL || !v ? "" : String(v))}>
      <SelectTrigger className="w-48">
        <SelectValue>
          {(v: string) =>
            v === ALL ? "Semua gudang" : (options.find((w) => w.id === v)?.name ?? "Gudang")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Semua gudang</SelectItem>
        {options.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
