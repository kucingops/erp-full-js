"use client";

import { CUSTOMERS_KEY } from "@/features/master-data/api";
import { PartnerListPage } from "@/features/master-data/partner-list-page";

export default function CustomersPage() {
  return (
    <PartnerListPage
      resource={CUSTOMERS_KEY}
      label="Customer"
      description="Data pelanggan untuk Sales Order"
      codePlaceholder="CUST-001"
      writeRoles={["SALES"]}
    />
  );
}
