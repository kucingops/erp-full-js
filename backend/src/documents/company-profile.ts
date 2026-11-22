import type { CompanyProfile } from './printable-document.js';

/** Default kalau env kosong, supaya dokumen tetap bisa dicetak di lokal. */
export const DEFAULT_COMPANY: CompanyProfile = {
  name: 'PT Mini ERP Indonesia',
  address: 'Jl. Contoh No. 1, Jakarta 10110',
  npwp: '00.000.000.0-000.000',
  city: 'Jakarta',
};

type Env = Record<string, string | undefined>;

/** Baca `COMPANY_*` dari env (string kosong dianggap tidak diisi). */
export function companyFromEnv(env: Env): CompanyProfile {
  const pick = (key: string) => env[key]?.trim() || undefined;
  return {
    name: pick('COMPANY_NAME') ?? DEFAULT_COMPANY.name,
    address: pick('COMPANY_ADDRESS') ?? DEFAULT_COMPANY.address,
    npwp: pick('COMPANY_NPWP') ?? DEFAULT_COMPANY.npwp,
    phone: pick('COMPANY_PHONE'),
    email: pick('COMPANY_EMAIL'),
    city: pick('COMPANY_CITY') ?? DEFAULT_COMPANY.city,
  };
}
