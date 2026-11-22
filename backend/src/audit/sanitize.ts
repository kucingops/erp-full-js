/** Key yang tidak boleh pernah masuk audit log (passwordHash, tokenHash, refreshToken, secret, ...). */
const SENSITIVE_KEY = /password|token|secret|hash/i;

/**
 * Ubah nilai jadi JSON polos (Decimal → string, Date → ISO) lalu buang key sensitif secara rekursif.
 * Return `null` untuk nilai kosong supaya kolom Json di DB tetap NULL.
 */
export function sanitizeForAudit(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const plain: unknown = JSON.parse(JSON.stringify(value));
  return strip(plain);
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, v]) => [key, strip(v)]),
    );
  }
  return value;
}
