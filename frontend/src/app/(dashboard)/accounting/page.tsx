import { redirect } from "next/navigation";

/** /accounting -> tab pertama. */
export default function AccountingIndexPage() {
  redirect("/accounting/journals");
}
