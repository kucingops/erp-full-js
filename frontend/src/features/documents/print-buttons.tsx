"use client";

import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiBlob } from "@/lib/api";

/** Object URL di tab baru tidak boleh langsung di-revoke (PDF viewer masih membaca). */
const REVOKE_AFTER_MS = 60_000;

/**
 * Tombol "Cetak" (buka PDF di tab baru) dan "Unduh PDF" untuk dokumen.
 * PDF diambil lewat `apiBlob()` (Bearer token + auto refresh), lalu dibuka sebagai
 * object URL. Link biasa `<a href="/api/.../pdf">` tidak bisa karena tidak membawa token.
 *
 * @param resource path API dokumen, misal `/sales-invoices`
 * @param number nomor dokumen, dipakai sebagai nama file unduhan
 */
export function PrintButtons({ resource, id, number }: { resource: string; id: string; number: string }) {
  const [busy, setBusy] = useState<"print" | "download" | null>(null);
  const path = `${resource}/${id}/pdf`;

  async function print() {
    // Buka tab kosong SEBELUM await: window.open setelah request async diblokir popup blocker.
    const tab = window.open("", "_blank");
    setBusy("print");
    try {
      const url = URL.createObjectURL(await apiBlob(path));
      if (tab) tab.location.href = url;
      else window.location.assign(url); // popup tetap diblokir → buka di tab ini
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
    } catch (e) {
      tab?.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("download");
    try {
      const url = URL.createObjectURL(await apiBlob(path, { query: { download: 1 } }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button variant="outline" disabled={busy !== null} onClick={print}>
        <Printer /> {busy === "print" ? "Menyiapkan..." : "Cetak"}
      </Button>
      <Button variant="outline" disabled={busy !== null} onClick={download}>
        <Download /> {busy === "download" ? "Mengunduh..." : "Unduh PDF"}
      </Button>
    </>
  );
}
