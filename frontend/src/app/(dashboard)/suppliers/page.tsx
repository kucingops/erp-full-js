"use client";

import { SUPPLIERS_KEY } from "@/features/master-data/api";
import { PartnerListPage } from "@/features/master-data/partner-list-page";

export default function SuppliersPage() {
  return (
    <PartnerListPage
      resource={SUPPLIERS_KEY}
      label="Supplier"
      description="Data pemasok untuk Purchase Order"
      codePlaceholder="SUP-001"
      writeRoles={["PURCHASING"]}
    />
  );
}
