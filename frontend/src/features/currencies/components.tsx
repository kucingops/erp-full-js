"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrencyOptions, useRateFor } from "./api";
import { formatMoney, formatRate, isForeign } from "./format";
import { BASE_CURRENCY } from "./types";

/** Nilai khusus Select untuk "tanpa default" (Base UI Select tidak suka value kosong). */
const NONE = "__none__";

/**
 * Dropdown mata uang aktif. `allowEmpty` = ada opsi "Default (IDR)" yang mengirim null
 * (dipakai di form customer/supplier).
 */
export function CurrencySelect({
  value,
  onChange,
  allowEmpty,
  emptyLabel = `Default (${BASE_CURRENCY})`,
  id,
}: {
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  allowEmpty?: boolean;
  /** Label opsi kosong, misal "Semua mata uang" untuk filter. */
  emptyLabel?: string;
  id?: string;
}) {
  const { data } = useCurrencyOptions();
  const current = value ?? (allowEmpty ? NONE : BASE_CURRENCY);
  return (
    <Select value={current} onValueChange={(v) => onChange(v === NONE ? null : (v as string))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(v: string) => {
            if (v === NONE) return emptyLabel;
            const c = data?.find((x) => x.code === v);
            return c ? `${c.code} · ${c.name}` : v;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {data?.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} · {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Blok mata uang + kurs di form PO/SO.
 * - Kurs kosong = backend ambil dari tabel kurs per tanggal order (preview ditampilkan di sini).
 * - Kurs diisi = override manual (misal kurs bank yang disepakati).
 */
export function DocCurrencyFields({
  currencyCode,
  onCurrencyChange,
  rate,
  onRateChange,
  orderDate,
  /** Kurs yang tersimpan di dokumen (mode edit), ditampilkan sebagai placeholder. */
  savedRate,
}: {
  currencyCode: string;
  onCurrencyChange: (code: string) => void;
  rate: number | undefined;
  onRateChange: (rate: number | undefined) => void;
  orderDate: string;
  savedRate?: string;
}) {
  const foreign = isForeign(currencyCode);
  const lookup = useRateFor(currencyCode, orderDate, foreign);
  const autoRate = lookup.data?.fromRate;

  let hint: string;
  if (!foreign) hint = `Mata uang dasar, kurs selalu 1.`;
  else if (rate) hint = "Pakai kurs manual.";
  else if (lookup.isLoading) hint = "Mengambil kurs...";
  else if (autoRate) hint = `Kurs otomatis ${lookup.data?.date}: 1 ${currencyCode} = ${formatMoney(autoRate)}`;
  else hint = "Belum ada kurs untuk tanggal ini. Isi kurs manual atau input kurs dulu.";

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="currencyCode">Mata uang</Label>
        <CurrencySelect
          id="currencyCode"
          value={currencyCode}
          onChange={(c) => {
            onCurrencyChange(c ?? BASE_CURRENCY);
            onRateChange(undefined);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="exchangeRate">Kurs ke {BASE_CURRENCY} (opsional)</Label>
        <Input
          id="exchangeRate"
          type="number"
          min={0}
          step="0.000001"
          disabled={!foreign}
          placeholder={foreign ? formatRate(savedRate ?? autoRate ?? "") || "otomatis" : "1"}
          value={rate ?? ""}
          onChange={(e) => onRateChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </>
  );
}

/** Kurs efektif untuk preview total base di form: manual → tersimpan → otomatis → 1. */
export function useEffectiveRate(
  currencyCode: string,
  orderDate: string,
  manual?: number,
  saved?: string,
) {
  const foreign = isForeign(currencyCode);
  const lookup = useRateFor(currencyCode, orderDate, foreign);
  if (!foreign) return 1;
  if (manual) return manual;
  if (saved) return Number(saved);
  return lookup.data ? Number(lookup.data.fromRate) : undefined;
}

/** "US$ 12,50 (≈ Rp 198.125)" untuk total dokumen asing; Rupiah saja untuk IDR. */
export function MoneyWithBase({
  amount,
  currencyCode,
  baseAmount,
}: {
  amount: string | number;
  currencyCode: string;
  baseAmount?: string | number;
}) {
  if (!isForeign(currencyCode) || baseAmount === undefined) {
    return <>{formatMoney(amount, currencyCode)}</>;
  }
  return (
    <span>
      {formatMoney(amount, currencyCode)}{" "}
      <span className="text-xs text-muted-foreground">(≈ {formatMoney(baseAmount)})</span>
    </span>
  );
}
